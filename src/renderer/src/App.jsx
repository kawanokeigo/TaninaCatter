import { useState, useEffect, useRef } from 'react';

// ★ 作成したコンポーネントをインポート
import BlacklistModal from './components/BlacklistModal';
import ProcessDropdown from './components/ProcessDropdown';
import ConnectBubble from './components/ConnectBubble';
import Sword from './components/Sword';
import MainBox from './components/MainBox';

const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

function App() {
  const [processList, setProcessList] = useState([]);
  const [selectedProcess, setSelectedProcess] = useState('');
  const [isConn, setIsConn] = useState(false);
  const [m5Mode, setM5Mode] = useState('SAFE');
  const [targetMode, setTargetMode] = useState('process');
  const [isAttacking, setIsAttacking] = useState(false);

  const [isBlacklistOpen, setIsBlacklistOpen] = useState(false);
  const [processBlacklist, setProcessBlacklist] = useState(() => JSON.parse(localStorage.getItem('processBlacklist') || '[]'));
  const [browserBlacklist, setBrowserBlacklist] = useState(() => JSON.parse(localStorage.getItem('browserBlacklist') || '[]'));
  const [rawProcessList, setRawProcessList] = useState([]);

  const processListRef = useRef([]);
  const targetProcessRef = useRef('');
  const disconnectTimerRef = useRef(null);
  const dropdownRef = useRef(null);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const targetModeRef = useRef(targetMode);
  targetModeRef.current = targetMode;

  const processBlacklistRef = useRef(processBlacklist);
  processBlacklistRef.current = processBlacklist;

  const browserBlacklistRef = useRef(browserBlacklist);
  browserBlacklistRef.current = browserBlacklist;

  useEffect(() => { localStorage.setItem('processBlacklist', JSON.stringify(processBlacklist)); }, [processBlacklist]);
  useEffect(() => { localStorage.setItem('browserBlacklist', JSON.stringify(browserBlacklist)); }, [browserBlacklist]);

  useEffect(() => {
    window.api.onOpenBlacklist(() => { setIsBlacklistOpen(true); });
  }, []);

  const fetchProcesses = async () => {
    try {
      const processes = await window.api.getProcesses();
      const uniqueNames = Array.from(new Set(processes.map(p => p.name)));
      setRawProcessList(uniqueNames);

      const activeBlacklist = targetModeRef.current === 'process' ? processBlacklistRef.current : browserBlacklistRef.current;
      const filteredNames = uniqueNames.filter(name => !activeBlacklist.includes(name));

      setProcessList(filteredNames);
      processListRef.current = filteredNames;

      if (activeBlacklist.includes(targetProcessRef.current)) updateSelectedProcess('');
    } catch (error) { console.error('プロセス取得エラー:', error); }
  };

  useEffect(() => {
    window.api.getCurrentMode().then(mode => setTargetMode(mode));
    window.api.onTargetModeChanged((mode) => {
      setTargetMode(mode); targetModeRef.current = mode;
      setSelectedProcess(''); setIsBlacklistOpen(false); fetchProcesses();
    });

    fetchProcesses();
    const interval = setInterval(fetchProcesses, 3000);
    return () => clearInterval(interval);
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
    try {
      const device = await navigator.bluetooth.requestDevice({ filters: [{ name: 'M5-TaskKill-BLE' }], optionalServices: [SERVICE_UUID] });
      device.addEventListener('gattserverdisconnected', () => { handleDisconnect(); });

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(SERVICE_UUID);
      const characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);

      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', (event) => {
        handleCommand(new TextDecoder().decode(event.target.value).trim());
      });

      setIsConn(true);
      resetDisconnectTimer();

      try {
        const initialValue = await characteristic.readValue();
        const initialCommand = new TextDecoder().decode(initialValue).trim();
        if (['0', '1', '2'].includes(initialCommand)) handleCommand(initialCommand);
        else setM5Mode('SAFE');
      } catch { setM5Mode('SAFE'); }

    } catch (error) {
      alert(`【接続エラー】\n${error.message}\n\n※一度WindowsのBluetooth設定から「デバイスの削除」をしてアプリを再起動してください。`);
    }
  };

  const handleCommand = (command) => {
    setIsConn(true); resetDisconnectTimer();
    const fullList = ['', ...processListRef.current];
    const currentTarget = targetProcessRef.current;
    const currentIndex = fullList.indexOf(currentTarget);

    if (command === '0') setM5Mode('SAFE');
    else if (command === '1') setM5Mode('SELECT');
    else if (command === '2') setM5Mode('KILL');
    else if (command === 'U') { if (currentIndex > 0) updateSelectedProcess(fullList[currentIndex - 1]); }
    else if (command === 'D') { if (currentIndex < fullList.length - 1) updateSelectedProcess(fullList[currentIndex + 1]); }
    else if (command === 'K') { if (currentTarget) executeKill(currentTarget); }
    else if (command === 'L') window.api.focusWindow();
  };

  const resetDisconnectTimer = () => {
    if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
    disconnectTimerRef.current = setTimeout(() => { handleDisconnect(); }, 2500);
  };

  const handleDisconnect = () => {
    setIsConn(false); setM5Mode('SAFE');
    if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
  };

  const updateSelectedProcess = (name) => {
    setSelectedProcess(name); targetProcessRef.current = name;
  };

  const executeKill = async (processName) => {
    if (!processName) return;
    setIsAttacking(true);
    setTimeout(() => { setIsAttacking(false); }, 300);

    try {
      await window.api.killProcess(processName);
      updateSelectedProcess(''); fetchProcesses();
    } catch (error) { console.error('タスクキル失敗:', error); }
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

  const getDisplayText = () => { return !isConn ? '未接続' : m5Mode; };
  const getBoxColor = () => {
    if (!isConn) return '#6b6b6b';
    if (m5Mode === 'SAFE') return '#4caf50';
    if (m5Mode === 'SELECT') return '#2196f3';
    if (m5Mode === 'KILL') return '#ff4500';
    return '#6b6b6b';
  };

  const handleMouseDown = (e) => {
    if (e.button === 0) {
      isDraggingRef.current = true;
      dragOffsetRef.current = { x: e.screenX - window.screenX, y: e.screenY - window.screenY };
    }
  };
  const handleMouseMove = (e) => {
    if (isDraggingRef.current) window.moveTo(e.screenX - dragOffsetRef.current.x, e.screenY - dragOffsetRef.current.y);
  };
  const handleMouseUp = () => { isDraggingRef.current = false; };
  const handleContextMenu = (e) => { e.preventDefault(); window.api.showContextMenu(); };

  return (
    <>
      <style>{`
        body, html { margin: 0; padding: 0; background: transparent !important; overflow: hidden; user-select: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .connect-btn:active { transform: scale(0.95); opacity: 0.8; }
      `}</style>

      <div
        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onContextMenu={handleContextMenu}
        style={{ position: 'relative', width: '100vw', height: '100vh', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: '20px', fontFamily: '"Yu Gothic", "Meiryo", sans-serif' }}
      >
        <div style={{ position: 'relative', width: '260px', height: '170px' }}>

          <BlacklistModal
            isOpen={isBlacklistOpen}
            onClose={() => setIsBlacklistOpen(false)}
            targetMode={targetMode}
            blacklist={targetMode === 'process' ? processBlacklist : browserBlacklist}
            rawProcessList={rawProcessList}
            onAdd={addBlacklist}
            onRemove={removeBlacklist}
          />

          <ProcessDropdown
            isVisible={isConn && m5Mode === 'SELECT' && !isBlacklistOpen}
            processList={processList}
            selectedProcess={selectedProcess}
            onSelect={updateSelectedProcess}
            containerRef={dropdownRef}
          />

          <ConnectBubble
            isConn={isConn}
            onClick={connectBLE}
            boxColor={getBoxColor()}
            displayText={getDisplayText()}
          />

          <Sword isAttacking={isAttacking} />

          <MainBox
            selectedProcess={selectedProcess}
            targetMode={targetMode}
          />

        </div>
      </div>
    </>
  );
}

export default App;
