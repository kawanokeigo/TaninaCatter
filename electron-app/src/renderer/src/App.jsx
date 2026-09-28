import { useState, useEffect, useRef } from 'react';

import VirtualM5Controller from './components/VirtualM5Controller';
import BlacklistModal from './components/BlacklistModal';
import ProcessDropdown from './components/ProcessDropdown';
import ConnectBubble from './components/ConnectBubble';
import Sword from './components/Sword';
import MainBox from './components/MainBox';

import s1Sound from './assets/s1.mp3';
import s2Sound from './assets/s2.mp3';
import s3Sound from './assets/s3.mp3';
import s4Sound from './assets/s4.mp3';
const slashSounds = [s1Sound, s2Sound, s3Sound, s4Sound];

const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

function App() {
  const [processList, setProcessList] = useState([]);
  const [selectedProcess, setSelectedProcess] = useState('');
  const [isConn, setIsConn] = useState(false);
  const [m5Mode, setM5Mode] = useState('未接続');
  const [targetMode, setTargetMode] = useState('process');
  const [isAttacking, setIsAttacking] = useState(false);

  const [isBlacklistOpen, setIsBlacklistOpen] = useState(false);
  const [processBlacklist, setProcessBlacklist] = useState(() => JSON.parse(localStorage.getItem('processBlacklist') || '[]'));
  const [browserBlacklist, setBrowserBlacklist] = useState(() => JSON.parse(localStorage.getItem('browserBlacklist') || '[]'));
  const [rawProcessList, setRawProcessList] = useState([]);

  const processListRef = useRef([]);
  const targetDetailsRef = useRef(new Map());
  const targetProcessRef = useRef('');
  const selectedTargetRef = useRef(null);
  const processFetchInFlightRef = useRef(false);
  const disconnectTimerRef = useRef(null);
  const dropdownRef = useRef(null);
  const killInFlightRef = useRef(false);
  const attackTimerRef = useRef(null);
  const slashTimerRef = useRef(null);
  const slashObjectUrlRef = useRef(null);
  const slashAudioRef = useRef([]);
  const slashAnimationIdRef = useRef(0);

  const [slashData, setSlashData] = useState(null);
  const [uiPos, setUiPos] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const targetModeRef = useRef(targetMode);
  const processBlacklistRef = useRef(processBlacklist);
  const browserBlacklistRef = useRef(browserBlacklist);

  const getTargetDescriptor = (name) => {
    if (selectedTargetRef.current?.name === name) return selectedTargetRef.current;
    return targetDetailsRef.current.get(name) || { name };
  };

  const clearKillPreparation = () => {
    if (window.api.clearPreparedKill) {
      window.api.clearPreparedKill().catch(error => console.error('事前キャプチャ破棄エラー:', error));
    }
  };

  const playSlashSound = () => {
    const players = slashAudioRef.current;
    if (players.length === 0) return;
    const audio = players[Math.floor(Math.random() * players.length)];
    audio.currentTime = 0;
    audio.play().catch(error => console.error('音声再生エラー:', error));
  };

  const createImageUrl = (image) => {
    if (typeof image === 'string') return image;

    let bytes = image?.bytes;
    if (bytes?.type === 'Buffer' && Array.isArray(bytes.data)) bytes = bytes.data;
    if (Array.isArray(bytes)) bytes = Uint8Array.from(bytes);
    else if (bytes instanceof ArrayBuffer) bytes = new Uint8Array(bytes);
    else if (ArrayBuffer.isView(bytes)) bytes = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    else return null;

    const mimeType = image.mimeType || 'image/jpeg';
    if (mimeType === 'image/jpeg' && (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff)) return null;

    const blob = new Blob([bytes], { type: mimeType });
    return URL.createObjectURL(blob);
  };

  useEffect(() => {
    const removeOpenBlacklistListener = window.api.onOpenBlacklist(
      () => { setIsBlacklistOpen(true); }
    );

    slashAudioRef.current = slashSounds.map(source => {
      const audio = new Audio(source);
      audio.preload = 'auto';
      audio.volume = 0.8;
      audio.load();
      return audio;
    });

    let removeSlashListener;
    if (window.api.onPlaySlashAnimation) {
      removeSlashListener = window.api.onPlaySlashAnimation((payload) => {
        const hasImageField = payload && Object.prototype.hasOwnProperty.call(payload, 'image');
        const imageUri = createImageUrl(hasImageField ? payload.image : payload);
        const targetName = payload?.targetName || 'TARGET';

        if (slashTimerRef.current) clearTimeout(slashTimerRef.current);
        if (slashObjectUrlRef.current) URL.revokeObjectURL(slashObjectUrlRef.current);
        slashObjectUrlRef.current = imageUri?.startsWith('blob:') ? imageUri : null;
        setSlashData({ imageUri, targetName, id: ++slashAnimationIdRef.current });

        slashTimerRef.current = setTimeout(() => {
          setSlashData(null);
          if (imageUri && slashObjectUrlRef.current === imageUri) {
            URL.revokeObjectURL(imageUri);
            slashObjectUrlRef.current = null;
          }
        }, 1500);
      });
    }

    return () => {
      if (removeOpenBlacklistListener) removeOpenBlacklistListener();
      if (removeSlashListener) removeSlashListener();
      if (slashTimerRef.current) clearTimeout(slashTimerRef.current);
      if (attackTimerRef.current) clearTimeout(attackTimerRef.current);
      if (slashObjectUrlRef.current) URL.revokeObjectURL(slashObjectUrlRef.current);
      for (const audio of slashAudioRef.current) {
        audio.pause();
        audio.src = '';
      }
    };
  }, []);

  useEffect(() => { targetModeRef.current = targetMode; }, [targetMode]);
  useEffect(() => { processBlacklistRef.current = processBlacklist; }, [processBlacklist]);
  useEffect(() => { browserBlacklistRef.current = browserBlacklist; }, [browserBlacklist]);

  const handleMouseEnterUI = () => {
    if (window.api && window.api.setIgnoreMouseEvents) {
      window.api.setIgnoreMouseEvents(false);
    }
  };

  const handleMouseLeaveUI = () => {
    if (window.api && window.api.setIgnoreMouseEvents) {
      window.api.setIgnoreMouseEvents(true, { forward: true });
    }
  };

  useEffect(() => { localStorage.setItem('processBlacklist', JSON.stringify(processBlacklist)); }, [processBlacklist]);
  useEffect(() => { localStorage.setItem('browserBlacklist', JSON.stringify(browserBlacklist)); }, [browserBlacklist]);

  const fetchProcesses = async () => {
    if (processFetchInFlightRef.current) return;
    processFetchInFlightRef.current = true;
    const requestedMode = targetModeRef.current;

    try {
      const processes = await window.api.getProcesses();
      if (requestedMode !== targetModeRef.current) return;

      const uniqueTargets = new Map();
      for (const process of processes) {
        if (!uniqueTargets.has(process.name)) uniqueTargets.set(process.name, process);
      }
      targetDetailsRef.current = uniqueTargets;

      const uniqueNames = Array.from(uniqueTargets.keys());
      setRawProcessList(uniqueNames);

      const activeBlacklist = targetModeRef.current === 'process' ? processBlacklistRef.current : browserBlacklistRef.current;
      const filteredNames = uniqueNames.filter(name => !activeBlacklist.includes(name));

      setProcessList(filteredNames);
      processListRef.current = filteredNames;

      const selectedTarget = selectedTargetRef.current;
      let selectedStillExists = true;
      if (selectedTarget && requestedMode === 'browser') {
        selectedStillExists = processes.some(process =>
          process.id === selectedTarget.id
          && process.connectionId === selectedTarget.connectionId
        );
      }
      else if (selectedTarget) {
        const liveProcessGroup = uniqueTargets.get(selectedTarget.name);
        selectedStillExists = Boolean(liveProcessGroup);
        if (liveProcessGroup) selectedTargetRef.current = liveProcessGroup;
      }

      if (activeBlacklist.includes(targetProcessRef.current) || !selectedStillExists) {
        selectedTargetRef.current = null;
        targetProcessRef.current = '';
        setSelectedProcess('');
        clearKillPreparation();
      }
    } catch (error) {
      console.error('プロセス取得エラー:', error);
    } finally {
      processFetchInFlightRef.current = false;
      if (requestedMode !== targetModeRef.current) void fetchProcesses();
    }
  };

  useEffect(() => {
    window.api.getCurrentMode().then(mode => setTargetMode(mode));
    const removeTargetModeListener = window.api.onTargetModeChanged((mode) => {
      setTargetMode(mode); targetModeRef.current = mode;
      selectedTargetRef.current = null;
      targetProcessRef.current = '';
      setSelectedProcess(''); setIsBlacklistOpen(false); clearKillPreparation(); fetchProcesses();
    });

    fetchProcesses();
    const interval = setInterval(fetchProcesses, 3000);
    return () => {
      clearInterval(interval);
      if (removeTargetModeListener) removeTargetModeListener();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchProcesses(); }, [processBlacklist, browserBlacklist]);

  useEffect(() => {
    if (m5Mode === 'SELECT' && isConn && dropdownRef.current) {
      const container = dropdownRef.current;
      const activeEl = container.querySelector('.active-item');
      if (activeEl) {
        const scrollPos = activeEl.offsetTop - (container.clientHeight / 2) + (activeEl.clientHeight / 2);
        requestAnimationFrame(() => { container.scrollTo({ top: scrollPos, behavior: 'smooth' }); });
      }
    }
  }, [selectedProcess, m5Mode, isConn]);

  const connectBLE = async () => {
    if (isConn || m5Mode === '検索中...' || m5Mode === '接続中...') return;
    setIsConn(false);
    setM5Mode('検索中...');

    try {
      const device = await navigator.bluetooth.requestDevice({ filters: [{ name: 'M5-TaskKill-BLE' }], optionalServices: [SERVICE_UUID] });
      setM5Mode('接続中...');

      device.addEventListener('gattserverdisconnected', () => { handleDisconnect(); });

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(SERVICE_UUID);
      const characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);

      await characteristic.startNotifications();

      let pingCount = 0;
      characteristic.addEventListener('characteristicvaluechanged', (event) => {
        const cmd = new TextDecoder().decode(event.target.value).trim();
        if (['0', '1', '2', 'U', 'D', 'K', 'L'].includes(cmd)) {
          pingCount++;
          if (pingCount >= 2) handleCommand(cmd);
        }
      });

      setTimeout(() => {
        if (pingCount < 2) {
          handleDisconnect();
          alert("【通信エラー（ゴースト接続）】\nM5StickCの電源が入っていないか、応答がありません。");
        }
      }, 4000);

    } catch (error) {
      console.error('BLE Connection Error:', error);
      if (!error.message.includes('cancelled') && !error.message.includes('User cancelled')) {
        alert(`【Bluetooth接続エラー】\n${error.message}`);
      }
      handleDisconnect();
    }
  };

  const handleCommand = (command) => {
    setIsConn(true);
    resetDisconnectTimer();

    const fullList = ['', ...processListRef.current];
    const currentTarget = targetProcessRef.current;
    const currentIndex = fullList.indexOf(currentTarget);

    if (command === '0') { setM5Mode('SAFE'); clearKillPreparation(); }
    else if (command === '1') { setM5Mode('SELECT'); clearKillPreparation(); }
    else if (command === '2') {
      setM5Mode('KILL');
      if (currentTarget && window.api.prepareKill) {
        window.api.prepareKill(getTargetDescriptor(currentTarget))
          .catch(error => console.error('事前キャプチャ開始エラー:', error));
      }
    }
    else if (command === 'U') { if (currentIndex > 0) updateSelectedProcess(fullList[currentIndex - 1]); }
    else if (command === 'D') { if (currentIndex < fullList.length - 1) updateSelectedProcess(fullList[currentIndex + 1]); }
    else if (command === 'K') { if (currentTarget) executeKill(currentTarget); }
    else if (command === 'L') window.api.focusWindow();
  };

  const resetDisconnectTimer = () => {
    if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
    disconnectTimerRef.current = setTimeout(() => { handleDisconnect(); }, 4000);
  };

  const handleDisconnect = () => {
    setIsConn(false);
    setM5Mode('未接続');
    clearKillPreparation();
    if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
  };

  const updateSelectedProcess = (name) => {
    clearKillPreparation();
    selectedTargetRef.current = name ? (targetDetailsRef.current.get(name) || { name }) : null;
    setSelectedProcess(name); targetProcessRef.current = name;
  };

  const executeKill = async (processName) => {
    if (!processName || killInFlightRef.current) return;
    killInFlightRef.current = true;
    setIsAttacking(true);
    playSlashSound();
    if (attackTimerRef.current) clearTimeout(attackTimerRef.current);
    attackTimerRef.current = setTimeout(() => { setIsAttacking(false); }, 300);

    try {
      const result = await window.api.killProcess(getTargetDescriptor(processName));
      if (result?.success) updateSelectedProcess('');
      else console.error('タスクキル失敗:', result);
      fetchProcesses();
    } catch (error) {
      console.error('タスクキル失敗:', error);
    } finally {
      killInFlightRef.current = false;
    }
  };

  const addBlacklist = (name) => {
    if (!name) return;
    if (targetMode === 'process') { if (!processBlacklist.includes(name)) setProcessBlacklist([...processBlacklist, name]); }
    else { if (!browserBlacklist.includes(name)) setBrowserBlacklist([...browserBlacklist, name]); }
  };

  const removeBlacklist = (name) => {
    if (targetMode === 'process') setProcessBlacklist(processBlacklist.filter(n => n !== name));
    else setBrowserBlacklist(browserBlacklist.filter(n => n !== name));
  };

  const getDisplayText = () => {
    if (!isConn) {
      if (m5Mode === '検索中...' || m5Mode === '接続中...') return m5Mode;
      return '未接続';
    }
    return m5Mode;
  };

  const getBoxColor = () => {
    if (m5Mode === '検索中...' || m5Mode === '接続中...') return '#ffb300';
    if (!isConn) return '#6b6b6b';
    if (m5Mode === 'SAFE') return '#4caf50';
    if (m5Mode === 'SELECT') return '#2196f3';
    if (m5Mode === 'KILL') return '#ff4500';
    return '#6b6b6b';
  };

  const handleMouseDown = (e) => {
    if (e.button === 0) {
      isDraggingRef.current = true;
      dragOffsetRef.current = { x: e.clientX - uiPos.x, y: e.clientY - uiPos.y };
    }
  };
  const handleMouseMove = (e) => {
    if (isDraggingRef.current) {
      setUiPos({ x: e.clientX - dragOffsetRef.current.x, y: e.clientY - dragOffsetRef.current.y });
    }
  };
  const handleMouseUp = () => { isDraggingRef.current = false; };
  const handleContextMenu = (e) => { e.preventDefault(); window.api.showContextMenu(); };

  const renderSlashTarget = () => slashData?.imageUri ? (
    <img
      src={slashData.imageUri}
      alt=""
      onError={() => {
        const failedUri = slashData.imageUri;
        setSlashData(current => current?.imageUri === failedUri ? { ...current, imageUri: null } : current);
        if (slashObjectUrlRef.current === failedUri) {
          URL.revokeObjectURL(failedUri);
          slashObjectUrlRef.current = null;
        }
      }}
      style={{
        maxWidth: '80%', maxHeight: '80%', objectFit: 'contain',
        borderRadius: '10px', boxShadow: '0 0 40px rgba(255, 255, 255, 0.3)'
      }}
    />
  ) : (
    <div style={{
      width: '80%', height: '70%', maxWidth: '960px', maxHeight: '600px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxSizing: 'border-box', padding: '40px', overflow: 'hidden',
      color: '#fff', background: 'linear-gradient(135deg, #320909, #100606)',
      border: '3px solid #ff3b3b', borderRadius: '10px',
      boxShadow: '0 0 40px rgba(255, 59, 59, 0.5)'
    }}>
      <span style={{
        fontSize: 'clamp(26px, 5vw, 68px)', fontWeight: 900,
        textAlign: 'center', overflowWrap: 'anywhere'
      }}>{slashData?.targetName || 'TARGET'}</span>
    </div>
  );

  return (
    <>
      <style>{`
        body, html { margin: 0; padding: 0; background: transparent !important; overflow: hidden; user-select: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .connect-btn:active { transform: scale(0.95); opacity: 0.8; }

        @keyframes slashLeft {
          0% { transform: translate(0, 0) rotate(0deg); filter: brightness(1); }
          15% { transform: translate(-10px, 5px) rotate(-1deg); filter: brightness(1.5); }
          100% { transform: translate(-150px, 120vh) rotate(-15deg); opacity: 0; filter: blur(2px); }
        }
        @keyframes slashRight {
          0% { transform: translate(0, 0) rotate(0deg); filter: brightness(1); }
          15% { transform: translate(10px, -5px) rotate(1deg); filter: brightness(1.5); }
          100% { transform: translate(150px, 120vh) rotate(15deg); opacity: 0; filter: blur(2px); }
        }
        @keyframes slashFlash {
          0% { opacity: 0; transform: rotate(25deg) scaleY(0) scaleX(0.1); }
          20% { opacity: 1; transform: rotate(25deg) scaleY(1.2) scaleX(3); }
          100% { opacity: 0; transform: rotate(25deg) scaleY(1.5) scaleX(0); }
        }
      `}</style>

      {/* ======== ★ 斬撃エフェクトのオーバーレイ ======== */}
      {slashData && (
        <div key={slashData.id} style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          zIndex: 9999, pointerEvents: 'none',
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
        }}>
          {/* 対象アプリの左上半分（★Flexbox＋imgタグで確実に中央表示） */}
          <div style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            clipPath: 'polygon(0 0, 70% 0, 30% 100%, 0 100%)',
            animation: 'slashLeft 1.2s forwards ease-in',
          }}>
            {renderSlashTarget()}
          </div>

          {/* 対象アプリの右下半分（★Flexbox＋imgタグで確実に中央表示） */}
          <div style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            clipPath: 'polygon(70% 0, 100% 0, 100% 100%, 30% 100%)',
            animation: 'slashRight 1.2s forwards ease-in',
          }}>
            {renderSlashTarget()}
          </div>

          {/* 斬撃の白い光 */}
          <div style={{
            position: 'absolute', top: '-50%', left: '48%', width: '4%', height: '200%',
            backgroundColor: '#fff', boxShadow: '0 0 40px 20px #fff',
            transform: 'rotate(25deg)', animation: 'slashFlash 0.5s forwards ease-out',
          }} />
        </div>
      )}

      {/* 外側の背景領域 */}
      <div
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ position: 'relative', width: '100vw', height: '100vh', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: '20px', fontFamily: '"Yu Gothic", "Meiryo", sans-serif' }}
      >
        <div
          onMouseEnter={handleMouseEnterUI}
          onMouseLeave={handleMouseLeaveUI}
          onMouseDown={handleMouseDown}
          onContextMenu={handleContextMenu}
          style={{
            position: 'relative', width: '260px', height: '170px',
            transform: `translate(${uiPos.x}px, ${uiPos.y}px)`,
          }}
        >
          <BlacklistModal isOpen={isBlacklistOpen} onClose={() => setIsBlacklistOpen(false)} targetMode={targetMode} blacklist={targetMode === 'process' ? processBlacklist : browserBlacklist} rawProcessList={rawProcessList} onAdd={addBlacklist} onRemove={removeBlacklist} />
          <ProcessDropdown isVisible={isConn && m5Mode === 'SELECT' && !isBlacklistOpen} processList={processList} selectedProcess={selectedProcess} onSelect={updateSelectedProcess} containerRef={dropdownRef} />
          <ConnectBubble isConn={isConn} onClick={connectBLE} boxColor={getBoxColor()} displayText={getDisplayText()} />
          <Sword isAttacking={isAttacking} />
          <MainBox selectedProcess={selectedProcess} targetMode={targetMode} />


          {/* これデバッグ用の仮想m5出してるやつやからm5あるならコメントアウトしてね */}
          {/* <VirtualM5Controller onCommand={handleCommand} isConn={isConn} /> */}


        </div>
      </div>
    </>
  );
}

export default App;
