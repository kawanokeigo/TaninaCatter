#include <M5Unified.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <math.h>

#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

namespace {

constexpr float DEG_TO_RAD_F = 0.01745329251994329577f;
constexpr float RAD_TO_DEG_F = 57.29577951308232088f;

// IMU filter and stability thresholds.
constexpr float ACCEL_STATIONARY_TOLERANCE_G = 0.08f;
constexpr float ACCEL_STATIONARY_EXIT_G = 0.12f;
constexpr float GYRO_STATIONARY_THRESHOLD_DPS = 6.0f;
constexpr float GYRO_STATIONARY_EXIT_DPS = 10.0f;
constexpr float ACCEL_REJECTION_RANGE_G = 0.20f;
constexpr float GYRO_ACCEL_REJECTION_DPS = 120.0f;
constexpr float MAHONY_KP_MOVING = 0.35f;
constexpr float MAHONY_KP_STATIONARY = 3.0f;
constexpr float GYRO_BIAS_TAU_SECONDS = 8.0f;
constexpr float TILT_LPF_TAU_SECONDS = 0.08f;

// Gesture thresholds. Enter and release values differ to prevent chatter.
constexpr float LEVEL_ENTER_DEG = 3.0f;
constexpr float LEVEL_EXIT_DEG = 6.0f;
constexpr float SELECT_ENTER_DEG = 15.0f;
constexpr float SELECT_RELEASE_DEG = 8.0f;
constexpr float CROSS_TILT_LIMIT_DEG = 35.0f;
constexpr float KILL_ACCEL_THRESHOLD_G = 2.5f;
constexpr float NAV_DIRECTION_SIGN = 1.0f;

constexpr uint32_t STATIONARY_HOLD_MS = 350;
constexpr uint32_t SELECT_REPEAT_MS = 400;
constexpr uint32_t KILL_COOLDOWN_MS = 600;
constexpr uint32_t KILL_TRANSITION_MS = 200;
constexpr uint32_t KILL_SELECT_MINIMUM_MS = 250;
constexpr uint32_t HEARTBEAT_MS = 1000;

struct OrientationState {
  float q0 = 1.0f;
  float q1 = 0.0f;
  float q2 = 0.0f;
  float q3 = 0.0f;
  float gyroBiasX = 0.0f;
  float gyroBiasY = 0.0f;
  float gyroBiasZ = 0.0f;
  float accelX = 0.0f;
  float accelY = 0.0f;
  float accelZ = 0.0f;
  float accelMagnitude = 0.0f;
  float navTiltDeg = 0.0f;
  float crossTiltDeg = 0.0f;
  float absoluteTiltDeg = 180.0f;
  float stationarySumX = 0.0f;
  float stationarySumY = 0.0f;
  float stationarySumZ = 0.0f;
  uint32_t stationarySamples = 0;
  uint32_t stationarySinceMs = 0;
  uint32_t levelSinceMs = 0;
  uint32_t lastSampleUs = 0;
  bool initialized = false;
  bool anglesInitialized = false;
  bool stationaryCandidate = false;
  bool stationary = false;
  bool levelCandidate = false;
  bool level = false;
  bool reseedPending = true;
  bool hasSample = false;
};

BLEServer* pServer = nullptr;
BLECharacteristic* pCharacteristic = nullptr;
volatile bool deviceConnected = false;
OrientationState orientation;
int currentMode = 0;
int navDirection = 0;
bool selectArmed = false;
bool killTransitionPending = false;
volatile bool screenDirty = true;
uint32_t selectNotBeforeMs = 0;
uint32_t killTransitionAtMs = 0;
uint32_t killFlashUntilMs = 0;
uint32_t linkFlashUntilMs = 0;
uint32_t lastKillTimeMs = 0;
uint32_t lastNavCommandTimeMs = 0;
uint32_t lastHeartbeatTimeMs = 0;

float clampUnit(float value) {
  if (value > 1.0f) return 1.0f;
  if (value < -1.0f) return -1.0f;
  return value;
}

float clamp01(float value) {
  if (value > 1.0f) return 1.0f;
  if (value < 0.0f) return 0.0f;
  return value;
}

bool elapsed(uint32_t now, uint32_t since, uint32_t interval) {
  return static_cast<uint32_t>(now - since) >= interval;
}

bool deadlineReached(uint32_t now, uint32_t deadline) {
  return static_cast<int32_t>(now - deadline) >= 0;
}

bool deadlinePending(uint32_t now, uint32_t deadline) {
  return deadline != 0 && static_cast<int32_t>(now - deadline) < 0;
}

void normalizeQuaternion() {
  const float norm = sqrtf(
    orientation.q0 * orientation.q0 + orientation.q1 * orientation.q1 +
    orientation.q2 * orientation.q2 + orientation.q3 * orientation.q3
  );
  if (norm < 0.000001f) {
    orientation.q0 = 1.0f;
    orientation.q1 = orientation.q2 = orientation.q3 = 0.0f;
    return;
  }
  const float inverseNorm = 1.0f / norm;
  orientation.q0 *= inverseNorm;
  orientation.q1 *= inverseNorm;
  orientation.q2 *= inverseNorm;
  orientation.q3 *= inverseNorm;
}

bool seedQuaternionFromAccel(float ax, float ay, float az) {
  const float norm = sqrtf(ax * ax + ay * ay + az * az);
  if (norm < 0.2f) return false;
  ax /= norm;
  ay /= norm;
  az /= norm;

  const float roll = atan2f(ay, az);
  const float pitch = atan2f(-ax, sqrtf(ay * ay + az * az));
  const float halfRoll = 0.5f * roll;
  const float halfPitch = 0.5f * pitch;
  const float cr = cosf(halfRoll);
  const float sr = sinf(halfRoll);
  const float cp = cosf(halfPitch);
  const float sp = sinf(halfPitch);

  orientation.q0 = cr * cp;
  orientation.q1 = sr * cp;
  orientation.q2 = cr * sp;
  orientation.q3 = -sr * sp;
  orientation.initialized = true;
  orientation.anglesInitialized = false;
  normalizeQuaternion();
  return true;
}

void resetStationaryWindow() {
  orientation.stationaryCandidate = false;
  orientation.stationarySinceMs = 0;
  orientation.stationarySumX = 0.0f;
  orientation.stationarySumY = 0.0f;
  orientation.stationarySumZ = 0.0f;
  orientation.stationarySamples = 0;
}

void beginLevelAcquisition(uint32_t readyNotBeforeMs) {
  selectArmed = false;
  navDirection = 0;
  selectNotBeforeMs = readyNotBeforeMs;
  orientation.stationary = false;
  orientation.level = false;
  orientation.levelCandidate = false;
  orientation.levelSinceMs = 0;
  orientation.reseedPending = true;
  resetStationaryWindow();
  screenDirty = true;
}

void updateEstimatedTilts(float dtSeconds, bool forceImmediate) {
  const float gx = 2.0f * (orientation.q1 * orientation.q3 - orientation.q0 * orientation.q2);
  const float gy = 2.0f * (orientation.q0 * orientation.q1 + orientation.q2 * orientation.q3);
  const float gz = orientation.q0 * orientation.q0 - orientation.q1 * orientation.q1
                 - orientation.q2 * orientation.q2 + orientation.q3 * orientation.q3;
  const float rawNavTilt = asinf(clampUnit(gy)) * RAD_TO_DEG_F;
  const float rawCrossTilt = asinf(clampUnit(-gx)) * RAD_TO_DEG_F;
  orientation.absoluteTiltDeg = acosf(clampUnit(gz)) * RAD_TO_DEG_F;

  if (forceImmediate || !orientation.anglesInitialized) {
    orientation.navTiltDeg = rawNavTilt;
    orientation.crossTiltDeg = rawCrossTilt;
    orientation.anglesInitialized = true;
    return;
  }
  const float alpha = clamp01(dtSeconds / (TILT_LPF_TAU_SECONDS + dtSeconds));
  orientation.navTiltDeg += alpha * (rawNavTilt - orientation.navTiltDeg);
  orientation.crossTiltDeg += alpha * (rawCrossTilt - orientation.crossTiltDeg);
}

bool updateOrientation() {
  if (!M5.Imu.update()) return false;
  const auto data = M5.Imu.getImuData();
  const uint32_t nowMs = millis();
  const uint32_t nowUs = micros();
  float dtSeconds = 0.0f;
  if (orientation.lastSampleUs != 0) {
    dtSeconds = static_cast<uint32_t>(nowUs - orientation.lastSampleUs) * 0.000001f;
  }
  orientation.lastSampleUs = nowUs;

  orientation.accelX = data.accel.x;
  orientation.accelY = data.accel.y;
  orientation.accelZ = data.accel.z;
  orientation.accelMagnitude = sqrtf(
    orientation.accelX * orientation.accelX +
    orientation.accelY * orientation.accelY +
    orientation.accelZ * orientation.accelZ
  );
  orientation.hasSample = true;

  const float correctedGx = data.gyro.x - orientation.gyroBiasX;
  const float correctedGy = data.gyro.y - orientation.gyroBiasY;
  const float correctedGz = data.gyro.z - orientation.gyroBiasZ;
  const float gyroMagnitude = sqrtf(
    correctedGx * correctedGx + correctedGy * correctedGy + correctedGz * correctedGz
  );
  const float accelError = fabsf(orientation.accelMagnitude - 1.0f);
  const bool stationaryEntry = accelError < ACCEL_STATIONARY_TOLERANCE_G &&
    gyroMagnitude < GYRO_STATIONARY_THRESHOLD_DPS;
  const bool stationaryHold = accelError < ACCEL_STATIONARY_EXIT_G &&
    gyroMagnitude < GYRO_STATIONARY_EXIT_DPS;

  if (orientation.stationary) {
    if (!stationaryHold) {
      orientation.stationary = false;
      orientation.level = false;
      orientation.levelCandidate = false;
      resetStationaryWindow();
    }
  } else if (stationaryEntry) {
    if (!orientation.stationaryCandidate) {
      resetStationaryWindow();
      orientation.stationaryCandidate = true;
      orientation.stationarySinceMs = nowMs;
    }
    orientation.stationarySumX += orientation.accelX;
    orientation.stationarySumY += orientation.accelY;
    orientation.stationarySumZ += orientation.accelZ;
    ++orientation.stationarySamples;
    if (elapsed(nowMs, orientation.stationarySinceMs, STATIONARY_HOLD_MS)) {
      orientation.stationary = true;
    }
  } else {
    resetStationaryWindow();
  }

  bool justSeeded = false;
  if (!orientation.initialized && accelError < ACCEL_REJECTION_RANGE_G) {
    justSeeded = seedQuaternionFromAccel(orientation.accelX, orientation.accelY, orientation.accelZ);
  }
  if (orientation.stationary && orientation.reseedPending && orientation.stationarySamples > 0) {
    const float inverseSamples = 1.0f / static_cast<float>(orientation.stationarySamples);
    justSeeded = seedQuaternionFromAccel(
      orientation.stationarySumX * inverseSamples,
      orientation.stationarySumY * inverseSamples,
      orientation.stationarySumZ * inverseSamples
    );
    if (justSeeded) orientation.reseedPending = false;
  }

  const bool validDt = dtSeconds > 0.0f && dtSeconds <= 0.05f;
  if (orientation.initialized && validDt && !justSeeded) {
    float ax = orientation.accelX;
    float ay = orientation.accelY;
    float az = orientation.accelZ;
    float feedbackX = 0.0f;
    float feedbackY = 0.0f;
    float feedbackZ = 0.0f;
    if (orientation.accelMagnitude > 0.2f) {
      const float inverseAccelNorm = 1.0f / orientation.accelMagnitude;
      ax *= inverseAccelNorm;
      ay *= inverseAccelNorm;
      az *= inverseAccelNorm;
      const float expectedX = 2.0f * (orientation.q1 * orientation.q3 - orientation.q0 * orientation.q2);
      const float expectedY = 2.0f * (orientation.q0 * orientation.q1 + orientation.q2 * orientation.q3);
      const float expectedZ = orientation.q0 * orientation.q0 - orientation.q1 * orientation.q1
                            - orientation.q2 * orientation.q2 + orientation.q3 * orientation.q3;
      float accelTrust = clamp01(1.0f - accelError / ACCEL_REJECTION_RANGE_G);
      if (gyroMagnitude > GYRO_ACCEL_REJECTION_DPS) accelTrust = 0.0f;
      const float kp = stationaryEntry ? MAHONY_KP_STATIONARY : MAHONY_KP_MOVING;
      feedbackX = kp * accelTrust * (ay * expectedZ - az * expectedY);
      feedbackY = kp * accelTrust * (az * expectedX - ax * expectedZ);
      feedbackZ = kp * accelTrust * (ax * expectedY - ay * expectedX);
    }

    const float gx = correctedGx * DEG_TO_RAD_F + feedbackX;
    const float gy = correctedGy * DEG_TO_RAD_F + feedbackY;
    const float gz = correctedGz * DEG_TO_RAD_F + feedbackZ;
    const float halfDt = 0.5f * dtSeconds;
    const float oldQ0 = orientation.q0;
    const float oldQ1 = orientation.q1;
    const float oldQ2 = orientation.q2;
    const float oldQ3 = orientation.q3;
    orientation.q0 += (-oldQ1 * gx - oldQ2 * gy - oldQ3 * gz) * halfDt;
    orientation.q1 += ( oldQ0 * gx + oldQ2 * gz - oldQ3 * gy) * halfDt;
    orientation.q2 += ( oldQ0 * gy - oldQ1 * gz + oldQ3 * gx) * halfDt;
    orientation.q3 += ( oldQ0 * gz + oldQ1 * gy - oldQ2 * gx) * halfDt;
    normalizeQuaternion();
  }

  if (orientation.stationary && validDt) {
    const float alpha = dtSeconds / (GYRO_BIAS_TAU_SECONDS + dtSeconds);
    orientation.gyroBiasX += alpha * (data.gyro.x - orientation.gyroBiasX);
    orientation.gyroBiasY += alpha * (data.gyro.y - orientation.gyroBiasY);
    orientation.gyroBiasZ += alpha * (data.gyro.z - orientation.gyroBiasZ);
  }
  if (orientation.initialized) updateEstimatedTilts(validDt ? dtSeconds : 0.01f, justSeeded);

  if (!orientation.stationary) {
    orientation.level = false;
    orientation.levelCandidate = false;
  } else if (orientation.level) {
    if (orientation.absoluteTiltDeg > LEVEL_EXIT_DEG) {
      orientation.level = false;
      orientation.levelCandidate = false;
    }
  } else if (orientation.absoluteTiltDeg <= LEVEL_ENTER_DEG) {
    if (justSeeded && !orientation.reseedPending) {
      orientation.level = true;
      orientation.levelCandidate = false;
    } else if (!orientation.levelCandidate) {
      orientation.levelCandidate = true;
      orientation.levelSinceMs = nowMs;
    } else if (elapsed(nowMs, orientation.levelSinceMs, STATIONARY_HOLD_MS)) {
      orientation.level = true;
      orientation.levelCandidate = false;
    }
  } else {
    orientation.levelCandidate = false;
  }
  return true;
}

void sendCommand(const char* command) {
  if (deviceConnected && pCharacteristic != nullptr) {
    pCharacteristic->setValue(command);
    pCharacteristic->notify();
  }
}

void sendCurrentMode() {
  if (currentMode == 0) sendCommand("0");
  else if (currentMode == 1) sendCommand("1");
  else if (currentMode == 2) sendCommand("2");
}

class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) override {
    deviceConnected = true;
    screenDirty = true;
  }
  void onDisconnect(BLEServer*) override {
    deviceConnected = false;
    currentMode = 0;
    selectArmed = false;
    navDirection = 0;
    killTransitionPending = false;
    screenDirty = true;
    BLEDevice::startAdvertising();
  }
};

void drawScreenIfNeeded(uint32_t nowMs) {
  static bool previousConnected = false;
  static int previousMode = -1;
  static bool previousArmed = false;
  static uint8_t previousFlash = 255;
  uint8_t flash = 0;
  if (deadlinePending(nowMs, killFlashUntilMs)) flash = 1;
  else if (deadlinePending(nowMs, linkFlashUntilMs)) flash = 2;
  if (!screenDirty && previousConnected == deviceConnected && previousMode == currentMode &&
      previousArmed == selectArmed && previousFlash == flash) return;

  previousConnected = deviceConnected;
  previousMode = currentMode;
  previousArmed = selectArmed;
  previousFlash = flash;
  screenDirty = false;
  M5.Display.fillScreen(flash == 1 ? RED : (flash == 2 ? BLUE : BLACK));
  M5.Display.setCursor(0, 0);

  if (flash == 1) {
    M5.Display.setTextColor(WHITE);
    M5.Display.println("SLASH!");
  } else if (flash == 2) {
    M5.Display.setTextColor(WHITE);
    M5.Display.println("LINK");
  } else if (!deviceConnected) {
    M5.Display.setTextColor(YELLOW);
    M5.Display.println("Waiting BLE...");
  } else if (currentMode == 0) {
    M5.Display.setTextColor(GREEN);
    M5.Display.println("1. SAFE (BLE)");
  } else if (currentMode == 1) {
    if (selectArmed) {
      M5.Display.setTextColor(CYAN);
      M5.Display.println("2. SELECT");
      M5.Display.println("READY");
    } else {
      M5.Display.setTextColor(YELLOW);
      M5.Display.println("LEVEL...");
      M5.Display.println("Keep still");
    }
  } else if (currentMode == 2) {
    M5.Display.setTextColor(RED);
    M5.Display.println("3. KILL!!");
  }
  M5.Display.setTextColor(WHITE);
}

void handleSelectMode(uint32_t nowMs) {
  if (!selectArmed) {
    if (deadlineReached(nowMs, selectNotBeforeMs) && orientation.stationary &&
        orientation.level && !orientation.reseedPending) {
      selectArmed = true;
      navDirection = 0;
      lastNavCommandTimeMs = nowMs;
      screenDirty = true;
    }
    return;
  }
  if (!orientation.stationary || fabsf(orientation.crossTiltDeg) > CROSS_TILT_LIMIT_DEG) return;

  const float navTilt = orientation.navTiltDeg * NAV_DIRECTION_SIGN;
  int nextDirection = navDirection;
  if (navTilt >= SELECT_ENTER_DEG) nextDirection = 1;
  else if (navTilt <= -SELECT_ENTER_DEG) nextDirection = -1;
  else if (fabsf(navTilt) <= SELECT_RELEASE_DEG) nextDirection = 0;

  if (nextDirection != navDirection) {
    navDirection = nextDirection;
    if (navDirection != 0) {
      sendCommand(navDirection > 0 ? "U" : "D");
      lastNavCommandTimeMs = nowMs;
      lastHeartbeatTimeMs = nowMs;
    }
  } else if (navDirection != 0 && elapsed(nowMs, lastNavCommandTimeMs, SELECT_REPEAT_MS)) {
    sendCommand(navDirection > 0 ? "U" : "D");
    lastNavCommandTimeMs = nowMs;
    lastHeartbeatTimeMs = nowMs;
  }
}

void startKillTransition(uint32_t nowMs) {
  sendCommand("K");
  killTransitionPending = true;
  killTransitionAtMs = nowMs + KILL_TRANSITION_MS;
  killFlashUntilMs = killTransitionAtMs;
  lastKillTimeMs = nowMs;
  lastHeartbeatTimeMs = nowMs;
  beginLevelAcquisition(nowMs + KILL_SELECT_MINIMUM_MS);
  screenDirty = true;
}

}  // namespace

void setup() {
  auto cfg = M5.config();
  M5.begin(cfg);
  Serial.begin(115200);

#if defined(ARDUINO_M5STACK_STICKS3) && \
    (M5UNIFIED_VERSION_MAJOR * 10000 + M5UNIFIED_VERSION_MINOR * 100 + M5UNIFIED_VERSION_PATCH) < 222
  M5.Imu.setAxisOrder(
    m5::IMU_Class::axis_y_pos,
    m5::IMU_Class::axis_x_neg,
    m5::IMU_Class::axis_z_pos
  );
#endif

  BLEDevice::init("M5-TaskKill-BLE");
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  BLEService* pService = pServer->createService(SERVICE_UUID);
  pCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ |
    BLECharacteristic::PROPERTY_WRITE |
    BLECharacteristic::PROPERTY_NOTIFY |
    BLECharacteristic::PROPERTY_INDICATE
  );
  pCharacteristic->addDescriptor(new BLE2902());
  pService->start();

  BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x0);
  BLEDevice::startAdvertising();

  M5.Display.setRotation(0);
  M5.Display.setTextSize(2);
  screenDirty = true;
  drawScreenIfNeeded(millis());
}

void loop() {
  M5.update();
  const bool imuUpdated = updateOrientation();
  const uint32_t nowMs = millis();
  bool primaryButtonHandled = false;

  if (killTransitionPending && deadlineReached(nowMs, killTransitionAtMs)) {
    killTransitionPending = false;
    currentMode = 1;
    sendCommand("1");
    lastHeartbeatTimeMs = nowMs;
    screenDirty = true;
  }

  if (deviceConnected) {
    if (elapsed(nowMs, lastHeartbeatTimeMs, HEARTBEAT_MS)) {
      sendCurrentMode();
      lastHeartbeatTimeMs = nowMs;
    }

    if (M5.BtnB.wasPressed()) {
      M5.Display.fillScreen(RED);
      M5.Display.setCursor(0, 0);
      M5.Display.setTextColor(WHITE);
      M5.Display.println("Reset...");
      delay(500);
      ESP.restart();
    }

    if (!killTransitionPending && M5.BtnA.wasReleased()) {
      primaryButtonHandled = true;
      if (M5.BtnA.wasReleaseFor(800)) {
        sendCommand("L");
        linkFlashUntilMs = nowMs + 200;
        lastHeartbeatTimeMs = nowMs;
        screenDirty = true;
      } else {
        currentMode = (currentMode + 1) % 3;
        if (currentMode == 1) beginLevelAcquisition(nowMs);
        else {
          selectArmed = false;
          navDirection = 0;
          screenDirty = true;
        }
        sendCurrentMode();
        lastHeartbeatTimeMs = nowMs;
      }
    }

    if (!killTransitionPending && !primaryButtonHandled) {
      if (currentMode == 2 && imuUpdated && elapsed(nowMs, lastKillTimeMs, KILL_COOLDOWN_MS)) {
        if (fabsf(orientation.accelX) > KILL_ACCEL_THRESHOLD_G ||
            fabsf(orientation.accelY) > KILL_ACCEL_THRESHOLD_G ||
            fabsf(orientation.accelZ) > KILL_ACCEL_THRESHOLD_G) {
          startKillTransition(nowMs);
        }
      } else if (currentMode == 1) {
        handleSelectMode(nowMs);
      }
    }
  }

  drawScreenIfNeeded(nowMs);
  delay(5);
}
