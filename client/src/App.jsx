import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [m5DataList, setM5DataList] = useState([]);
  const [processList, setProcessList] = useState([]);
  const [selectedProcess, setSelectedProcess] = useState('');
  const [btStatus, setBtStatus] = useState('未接続');

  const processListRef = useRef([]);
  const targetProcessRef = useRef('');

  // ==========================================
  // プロセス一覧取得
  // ==========================================
  const fetchProcesses = async () => {
    try {
      const res = await axios.get(
        'http://localhost:3000/api/processes'
      );

      // 同じ名前のプロセスを重複排除
      const uniqueNames = Array.from(
        new Set(res.data.map((p) => p.name))
      );

      setProcessList(uniqueNames);
      processListRef.current = uniqueNames;
    } catch (error) {
      console.error('プロセス取得エラー:', error);
    }
  };

  // ==========================================
  // 初回読み込み・3秒ごとの自動更新
  // ==========================================
  useEffect(() => {
    document.title = 'M5-TaskKill';

    // 初回取得
    fetchProcesses();

    // 3秒ごとにプロセス一覧を更新
    const interval = setInterval(() => {
      fetchProcesses();
    }, 3000);

    // コンポーネント終了時にタイマー解除
    return () => clearInterval(interval);
  }, []);

  // ==========================================
  // 選択中のプロセスを更新
  // ==========================================
  const updateSelectedProcess = (name) => {
    setSelectedProcess(name);
    targetProcessRef.current = name;
  };

  // ==========================================
  // Web Bluetooth接続
  // ==========================================
  const connectWebBluetooth = async () => {
    try {
      setBtStatus('デバイスを検索中...');

      const SERVICE_UUID =
        '12345678-1234-1234-1234-1234567890ab';

      const CHARACTERISTIC_UUID =
        '87654321-4321-4321-4321-ba0987654321';

      // M5Stickを検索
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ name: 'M5-TaskKill' }],
        optionalServices: [SERVICE_UUID],
      });

      // 切断されたとき
      device.addEventListener(
        'gattserverdisconnected',
        () => {
          setBtStatus(
            '切断されました（M5の電源を確認してください）'
          );
        }
      );

      // GATTサーバーへ接続
      const server = await device.gatt.connect();

      // サービス取得
      const service =
        await server.getPrimaryService(SERVICE_UUID);

      // キャラクタリスティック取得
      const characteristic =
        await service.getCharacteristic(
          CHARACTERISTIC_UUID
        );

      // 通知開始
      await characteristic.startNotifications();

      // ==========================================
      // M5Stickからのデータ受信
      // ==========================================
      characteristic.addEventListener(
        'characteristicvaluechanged',
        (event) => {
          const time =
            new Date().toLocaleTimeString();

          const decoder = new TextDecoder();

          const command =
            decoder.decode(event.target.value);

          const list = processListRef.current;

          const currentTarget =
            targetProcessRef.current;

          const currentIndex =
            list.indexOf(currentTarget);

          // ==========================================
          // K：タスクキル
          // ==========================================
          if (command === 'K') {
            if (!currentTarget) {
              setM5DataList((prev) => [
                `[${time}] ⚠️ ターゲットが未選択です`,
                ...prev.slice(0, 9),
              ]);
            } else {
              setM5DataList((prev) => [
                `[${time}] 💥 腕振り検知！ [${currentTarget}] を一掃`,
                ...prev.slice(0, 9),
              ]);

              executeKill(currentTarget);
            }
          }

          // ==========================================
          // U：上へ移動
          // ==========================================
          else if (command === 'U') {
            if (currentIndex > 0) {
              updateSelectedProcess(
                list[currentIndex - 1]
              );

              setM5DataList((prev) => [
                `[${time}] ⬆️ 選択: ${
                  list[currentIndex - 1]
                }`,
                ...prev.slice(0, 9),
              ]);
            }
          }

          // ==========================================
          // D：下へ移動
          // ==========================================
          else if (command === 'D') {
            // 未選択状態なら一番上を選択
            if (
              currentIndex === -1 &&
              list.length > 0
            ) {
              updateSelectedProcess(list[0]);

              setM5DataList((prev) => [
                `[${time}] ⬇️ 選択: ${list[0]}`,
                ...prev.slice(0, 9),
              ]);
            }

            // 次のプロセスへ
            else if (
              currentIndex < list.length - 1
            ) {
              updateSelectedProcess(
                list[currentIndex + 1]
              );

              setM5DataList((prev) => [
                `[${time}] ⬇️ 選択: ${
                  list[currentIndex + 1]
                }`,
                ...prev.slice(0, 9),
              ]);
            }
          }

          // ==========================================
          // L：管理画面を最前面
          // ==========================================
          else if (command === 'L') {
            setM5DataList((prev) => [
              `[${time}] 📢 管理画面を最前面に呼び出し`,
              ...prev.slice(0, 9),
            ]);

            axios
              .post('http://localhost:3000/api/focus')
              .catch((e) =>
                console.error(e)
              );
          }
        }
      );

      setBtStatus(
        '🔗 Web Bluetooth 接続完了！ジェスチャー待機中'
      );
    } catch (error) {
      console.error('接続エラー:', error);

      setBtStatus(
        `接続失敗: ${error.message}`
      );
    }
  };

  // ==========================================
  // タスクキル
  // ==========================================
  const executeKill = async (processName) => {
    if (!processName) return;

    try {
      await axios.post(
        'http://localhost:3000/api/kill',
        { processName }
      );

      // 選択状態をリセット
      updateSelectedProcess('');

      // プロセス一覧を更新
      fetchProcesses();
    } catch (error) {
      console.error(
        'タスクキル失敗:',
        error
      );
    }
  };

  return (
    <div className="app">

      {/* ==========================================
          ロゴ
      ========================================== */}
      <header className="header">
        <img
          src="/taninakatta-%20logo.png"
          alt="たにょなカッター ロゴ"
          className="logo-image"
        />
      </header>

      {/* ==========================================
          接続状況
      ========================================== */}
      <section className="connection-card">

        <h2>接続状況</h2>

        <p className="status">
          ステータス：{btStatus}
        </p>

        <button
          className="blue-button connect-button"
          onClick={connectWebBluetooth}
        >
          M5Stickに接続
        </button>

      </section>

      {/* ==========================================
          ターゲット選択
      ========================================== */}
      <section className="target-section">

        <div className="target-controls">

          <select
            value={selectedProcess}
            onChange={(e) =>
              updateSelectedProcess(
                e.target.value
              )
            }
          >

            <option value="">
              タスクキルする対象を選択
            </option>

            {processList.map((name) => (
              <option
                key={name}
                value={name}
              >
                {name}
              </option>
            ))}

          </select>

          <button
            className="blue-button refresh-button"
            onClick={fetchProcesses}
          >
            手動で更新
          </button>

        </div>

        <p className="help-text">
          ※M5Stickを「選択モード(青)」か
          「キルモード(赤)」にして、M5Stickを傾けると選択肢が動くよ！！
        </p>

      </section>

      {/* ==========================================
          受信ログ
      ========================================== */}
      <section className="log-card">

        <h2>受信ログ</h2>

        <div className="log-area">

          {m5DataList.length === 0 ? (

            <p className="empty-log">
              M5Stickを操作してジェスチャーを入力してください...
            </p>

          ) : (

            m5DataList.map((item, index) => (

              <div
                className="log-item"
                key={index}
              >
                👉 {item}
              </div>

            ))

          )}

        </div>

      </section>

    </div>
  );
}

export default App;