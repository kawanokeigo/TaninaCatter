import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [m5DataList, setM5DataList] = useState([]);
  const [processList, setProcessList] = useState([]);
  const [selectedProcess, setSelectedProcess] = useState('');
  const [btStatus, setBtStatus] = useState('未接続');

  // 裏側のイベントリスナーで最新のリストと選択項目を参照するためのRef
  const processListRef = useRef([]);
  const targetProcessRef = useRef('');

  const fetchProcesses = async () => {
    try {
      const res = await axios.get('http://localhost:3000/api/processes');
      // 重複を排除してアプリ名のリストを作成
      const uniqueNames = Array.from(new Set(res.data.map(p => p.name)));
      setProcessList(uniqueNames);
      processListRef.current = uniqueNames;
      
      // ※ 自動選択機能は削除しました（キル後に未選択状態を維持するため）
    } catch (error) {
      console.error('プロセス取得エラー:', error);
    }
  };

  useEffect(() => {
    document.title = "M5-TaskKill";
    fetchProcesses(); // 初回取得
    
    // ★追加：3秒ごとに自動でプロセスリストを更新する
    const interval = setInterval(() => {
      fetchProcesses();
    }, 3000);
    
    // コンポーネント破棄時にタイマーを解除
    return () => clearInterval(interval);
  }, []);

  const updateSelectedProcess = (name) => {
    setSelectedProcess(name);
    targetProcessRef.current = name;
  };

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

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(SERVICE_UUID);
      const characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);

      await characteristic.startNotifications();

      characteristic.addEventListener('characteristicvaluechanged', (event) => {
        const time = new Date().toLocaleTimeString();
        const decoder = new TextDecoder();
        const command = decoder.decode(event.target.value);
        
        const list = processListRef.current;
        const currentTarget = targetProcessRef.current;
        const currentIndex = list.indexOf(currentTarget);

        if (command === 'K') {
          // ★変更：未選択状態で振った場合は弾く
          if (!currentTarget) {
            setM5DataList((prev) => [`[${time}] ⚠️ ターゲットが未選択です`, ...prev.slice(0, 9)]);
          } else {
            setM5DataList((prev) => [`[${time}] 💥 腕振り検知！ [${currentTarget}] を一掃`, ...prev.slice(0, 9)]);
            executeKill(currentTarget);
          }
        } 
        else if (command === 'U') {
          // 上（奥）へ移動
          if (currentIndex > 0) {
            updateSelectedProcess(list[currentIndex - 1]);
            setM5DataList((prev) => [`[${time}] ⬆️ 選択: ${list[currentIndex - 1]}`, ...prev.slice(0, 9)]);
          }
        } 
        else if (command === 'D') {
          // 下（手前）へ移動
          if (currentIndex === -1 && list.length > 0) {
            // ★追加：未選択状態から下に傾けたら、一番上のアプリを選択する
            updateSelectedProcess(list[0]);
            setM5DataList((prev) => [`[${time}] ⬇️ 選択: ${list[0]}`, ...prev.slice(0, 9)]);
          } else if (currentIndex < list.length - 1) {
            updateSelectedProcess(list[currentIndex + 1]);
            setM5DataList((prev) => [`[${time}] ⬇️ 選択: ${list[currentIndex + 1]}`, ...prev.slice(0, 9)]);
          }
        }
        else if (command === 'L') {
          setM5DataList((prev) => [`[${time}] 📢 管理画面を最前面に呼び出し`, ...prev.slice(0, 9)]);
          axios.post('http://localhost:3000/api/focus').catch(e => console.error(e));
        }
      });

      setBtStatus('🔗 Web Bluetooth 接続完了！ジェスチャー待機中');
    } catch (error) {
      console.error('接続エラー:', error);
      setBtStatus(`接続失敗: ${error.message}`);
    }
  };

  const executeKill = async (processName) => {
    if (!processName) return;
    try {
      await axios.post('http://localhost:3000/api/kill', { processName });
      
      // ★追加：キル成功後、ターゲットを未選択状態にリセットする
      updateSelectedProcess('');
      
      // リストをすぐに更新
      fetchProcesses(); 
    } catch (error) {
      console.error('タスクキル失敗:', error);
    }
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>M5Stick ジェスチャーコントロール</h1>

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
        <p>※M5Stickを「SELECT(青)」か「KILL(赤)」モードにして、画面を傾けると選択肢が動きます</p>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select 
            value={selectedProcess} 
            onChange={(e) => updateSelectedProcess(e.target.value)}
            style={{ padding: '0.5rem', fontSize: '1rem', width: '350px' }}
          >
            {/* ★追加：未選択状態のダミー選択肢 */}
            <option value="">-- キルする対象を選択してください --</option>
            {processList.map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          {/* 自動更新になったので「手動更新ボタン」は不要かもしれませんが、念のため残しています */}
          <button 
            onClick={fetchProcesses}
            style={{ padding: '0.5rem 1rem', fontSize: '1rem', background: '#e0e0e0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            🔄 手動更新
          </button>
        </div>
      </div>

      <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px' }}>
        <h2>📡 センサー受信ログ</h2>
        <ul style={{ background: '#222', color: '#0f0', padding: '1rem', borderRadius: '4px', minHeight: '100px', listStyle: 'none' }}>
          {m5DataList.length === 0 ? (
            <li style={{ color: '#888' }}>M5Stickを操作してジェスチャーを入力してください...</li>
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