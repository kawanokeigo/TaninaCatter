import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [m5DataList, setM5DataList] = useState([]);
  const [processList, setProcessList] = useState([]);
  
  // 今度は PID ではなく「プロセス名」を保持する
  const [selectedProcess, setSelectedProcess] = useState('');
  const targetProcessRef = useRef(''); 

  const [btStatus, setBtStatus] = useState('未接続');

  // ==========================================
  // プロセス一覧を取得して「名前」で重複排除する
  // ==========================================
  const fetchProcesses = async () => {
    try {
      const res = await axios.get('http://localhost:3000/api/processes');
      
      // 同じ名前（例: chrome.exe）がいっぱいあるので、重複を消して1つにまとめる
      const uniqueNames = Array.from(new Set(res.data.map(p => p.name)));
      
      setProcessList(uniqueNames);
      if (uniqueNames.length > 0) {
        updateSelectedProcess(uniqueNames[0]);
      }
    } catch (error) {
      console.error('プロセス取得エラー:', error);
    }
  };

  useEffect(() => {
    fetchProcesses();
  }, []);

  const updateSelectedProcess = (name) => {
    setSelectedProcess(name);
    targetProcessRef.current = name; // Bluetooth側で常に最新の名前を参照
  };

  // ==========================================
  // Web Bluetooth 接続処理
  // ==========================================
  const connectWebBluetooth = async () => {
    try {
      setBtStatus('デバイスを検索中...');
      const SERVICE_UUID = '12345678-1234-1234-1234-1234567890ab';
      const CHARACTERISTIC_UUID = '87654321-4321-4321-4321-ba0987654321';

      const device = await navigator.bluetooth.requestDevice({
        filters: [{ name: 'M5-TaskKill' }],
        optionalServices: [SERVICE_UUID]
      });

      device.addEventListener('gattserverdisconnected', () => {
        setBtStatus('切断されました（M5の電源を確認してください）');
      });

      setBtStatus('GATTサーバーに接続中...');
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(SERVICE_UUID);
      const characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);

      setBtStatus('通知を待機中...');
      await characteristic.startNotifications();

      characteristic.addEventListener('characteristicvaluechanged', () => {
        const time = new Date().toLocaleTimeString();
        const killTarget = targetProcessRef.current;
        
        setM5DataList((prev) => [`[${time}] 🟢 ボタン受信！ [${killTarget}] を一掃`, ...prev.slice(0, 9)]);
        
        executeKill(killTarget);
      });

      setBtStatus('🔗 Web Bluetooth 接続完了！');
    } catch (error) {
      console.error('接続エラー:', error);
      setBtStatus(`接続失敗: ${error.message}`);
    }
  };

  // ==========================================
  // タスクキル実行（名前で丸ごと一掃）
  // ==========================================
  const executeKill = async (processName) => {
    if (!processName) return;
    try {
      await axios.post('http://localhost:3000/api/kill', { processName });
      setTimeout(fetchProcesses, 1500); // 消えた後にリストをリフレッシュ
    } catch (error) {
      console.error('タスクキル失敗:', error);
    }
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>M5Stick Web Bluetooth コントロール</h1>

      <div style={{ marginTop: '1.5rem', padding: '1rem', border: '2px solid #2196F3', borderRadius: '8px', background: '#f0f8ff' }}>
        <h2>🌐 Web Bluetooth 接続</h2>
        <p>ステータス: <strong>{btStatus}</strong></p>
        <button
          onClick={connectWebBluetooth}
          style={{ padding: '0.6rem 1.2rem', fontSize: '1rem', background: '#2196F3', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          ブラウザからM5Stickに接続
        </button>
      </div>

      <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px' }}>
        <h2>🖥️ ターゲットプロセスの選択</h2>
        <p>M5のボタンで丸ごと終了させるアプリを選んでください</p>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select 
            value={selectedProcess} 
            onChange={(e) => updateSelectedProcess(e.target.value)}
            style={{ padding: '0.5rem', fontSize: '1rem', width: '350px' }}
          >
            {processList.map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <button 
            onClick={fetchProcesses}
            style={{ padding: '0.5rem 1rem', fontSize: '1rem', background: '#e0e0e0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            🔄 リスト更新
          </button>
          
          <button
            onClick={() => executeKill(selectedProcess)}
            style={{ padding: '0.5rem 1rem', fontSize: '1rem', background: '#ff4d4d', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            手動で強制終了
          </button>
        </div>
      </div>

      <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px' }}>
        <h2>📡 受信ログ</h2>
        <ul style={{ background: '#f4f4f4', padding: '1rem', borderRadius: '4px', minHeight: '100px', listStyle: 'none' }}>
          {m5DataList.length === 0 ? (
            <li style={{ color: '#888' }}>M5Stickと接続し、ボタンを押してください...</li>
          ) : (
            m5DataList.map((item, index) => (
              <li key={index} style={{ fontFamily: 'monospace', margin: '0.3rem 0' }}>👉 {item}</li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

export default App;