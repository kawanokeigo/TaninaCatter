#include <M5Unified.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <math.h>

#define SERVICE_UUID           "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID    "beb5483e-36e1-4688-b7f5-ea07361b26a8"

BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;

int currentMode = 0; 
unsigned long lastGestureTime = 0; 
unsigned long lastHeartbeatTime = 0; // 生存確認用タイマー
float baselinePitch = 0.0; 

class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
    }
    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      currentMode = 0; // 切断された瞬間に強制的にSAFEモード(0)に戻す
      BLEDevice::startAdvertising();
    }
};

void drawScreen() {
    M5.Display.fillScreen(BLACK);
    M5.Display.setCursor(0, 0);
    
    if (!deviceConnected) {
        M5.Display.setTextColor(YELLOW);
        M5.Display.println("Waiting BLE...");
        return;
    }

    if (currentMode == 0) {
        M5.Display.setTextColor(GREEN);
        M5.Display.println("1. SAFE (BLE)");
    } else if (currentMode == 1) {
        M5.Display.setTextColor(BLUE);
        M5.Display.println("2. SELECT (BLE)");
    } else if (currentMode == 2) {
        M5.Display.setTextColor(RED);
        M5.Display.println("3. KILL!!");
    }
    M5.Display.setTextColor(WHITE);
}

void sendCommand(const char* cmd) {
    if (deviceConnected && pCharacteristic != NULL) {
        pCharacteristic->setValue(cmd);
        pCharacteristic->notify();
    }
}

void setup() {
  auto cfg = M5.config();
  M5.begin(cfg); // ★ M5Unifiedの初期化 (これで機種を自動判別します)

  Serial.begin(115200);

  BLEDevice::init("M5-TaskKill-BLE");
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);
  pCharacteristic = pService->createCharacteristic(
                        CHARACTERISTIC_UUID,
                        BLECharacteristic::PROPERTY_READ   |
                        BLECharacteristic::PROPERTY_WRITE  |
                        BLECharacteristic::PROPERTY_NOTIFY |
                        BLECharacteristic::PROPERTY_INDICATE
                      );
  pCharacteristic->addDescriptor(new BLE2902());
  pService->start();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true); // 名前で検索できるようにtrue
  pAdvertising->setMinPreferred(0x0);
  BLEDevice::startAdvertising();

  M5.Display.setRotation(0); 
  M5.Display.fillScreen(BLACK);
  M5.Display.setTextSize(2);
  drawScreen(); 
}

void loop() {
  M5.update(); // ★ ここでボタンやセンサーの状態が自動更新される
  drawScreen(); 

  if (deviceConnected) {
    // 1秒に1回、現在のモードをPCに教える
    if (millis() - lastHeartbeatTime > 1000) {
        if (currentMode == 0) sendCommand("0");
        else if (currentMode == 1) sendCommand("1");
        else if (currentMode == 2) sendCommand("2");
        lastHeartbeatTime = millis();
    }

    if (M5.BtnB.wasPressed()) {
      M5.Display.fillScreen(RED);
      M5.Display.setCursor(0, 0);
      M5.Display.println("Reset...");
      delay(500);
      ESP.restart();
    }

    if (M5.BtnA.wasReleased()) {
        if (M5.BtnA.pressedFor(800)) {
            sendCommand("L"); 
            M5.Display.fillScreen(BLUE);
            delay(200);
        } else {
            currentMode = (currentMode + 1) % 3;
            
            if (currentMode == 1) {
                float tmpX, tmpY, tmpZ;
                M5.Imu.getAccel(&tmpX, &tmpY, &tmpZ); // ★ 新しい書き方
                baselinePitch = atan2(tmpY, tmpZ) * 180.0 / PI;
            }
            
            if (currentMode == 0) sendCommand("0");
            else if (currentMode == 1) sendCommand("1");
            else if (currentMode == 2) sendCommand("2");
            
            lastHeartbeatTime = millis(); // 送信したのでタイマーリセット
        }
    }

    if (currentMode > 0) {
        float accX = 0, accY = 0, accZ = 0;
        M5.Imu.getAccel(&accX, &accY, &accZ); // ★ 新しい書き方
        
        if (currentMode == 2 && (millis() - lastGestureTime > 600)) {
            if (abs(accX) > 2.5 || abs(accY) > 2.5 || abs(accZ) > 2.5) {
                sendCommand("K"); 
                M5.Display.fillScreen(RED);
                delay(200);
                
                currentMode = 1;
                sendCommand("1");
                lastGestureTime = millis();
                lastHeartbeatTime = millis();
            }
        }
        else if (currentMode == 1 && (millis() - lastGestureTime > 400)) {
            float currentPitch = atan2(accY, accZ) * 180.0 / PI;
            float diff = currentPitch - baselinePitch;
            
            if (diff > 180.0) diff -= 360.0;
            else if (diff < -180.0) diff += 360.0;

            if (diff > 15.0) {
                sendCommand("U"); 
                lastGestureTime = millis();
                lastHeartbeatTime = millis();
            }
            else if (diff < -15.0) {
                sendCommand("D"); 
                lastGestureTime = millis();
                lastHeartbeatTime = millis();
            }
        }
    }
  }
  delay(20);
}