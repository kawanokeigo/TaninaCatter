import killTargetImg from '../assets/kill-targetl.svg';

export default function MainBox({ selectedProcess, targetMode }) {
  const isTaskKill = targetMode === 'process';

  // タスクキル → 赤
  // タブキル → ピンク
  const modeColor = isTaskKill ? '#ff3b3b' : '#ff4fa3';

  return (
    <div
      style={{
        width: '260px',
        height: '170px',
        background: '#e2f9dd',

        // 緑の箱の縁を少し細く
        border: '3px solid #000',

        // 角を少しカクっと
        borderRadius: '20px',

        padding: '16px 20px 12px 20px',
        position: 'relative',
        zIndex: 1,
        boxSizing: 'border-box',
        fontFamily: '"Yu Gothic", "Meiryo", sans-serif',
      }}
    >
      {/* 緑の箱の中身をまとめて少し下へ */}
      <div
        style={{
          transform: 'translateY(10px)',
        }}
      >
        {/* 次のキル対象！ */}
        <div
          style={{
            fontWeight: '900',
            fontSize: '18px',
            color: '#000',
            textAlign: 'center',
            marginBottom: '5px',
            letterSpacing: '1px',
            lineHeight: '1.2',
          }}
        >
          次のキル対象！
        </div>

        {/* キル対象 */}
        <div
          style={{
            position: 'relative',
            width: '200px',
            height: '55px',
            margin: '0 auto',
          }}
        >
          {/* 黄色い対象枠 */}
          <img
            src={killTargetImg}
            alt="kill target"
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              objectFit: 'fill',
              left: 0,
              top: 0,
            }}
          />

          {/* 未選択 / プロセス名 */}
          <div
            style={{
              position: 'absolute',
              left: '10px',
              right: '10px',
              top: '5px',
              bottom: '5px',

              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',

              color: '#000',
              fontSize: selectedProcess ? '17px' : '18px',
              fontWeight: '900',

              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',

              textAlign: 'center',
              letterSpacing: '1px',
            }}
          >
            {selectedProcess || '未選択'}
          </div>
        </div>

        {/* タスクキル / タブキルモード */}
        <div
          style={{
            color: modeColor,
            fontWeight: '900',
            fontSize: '17px',
            textAlign: 'center',
            marginTop: '6px',
            marginRight: '0',
            letterSpacing: '1px',
          }}
        >
          {isTaskKill ? 'タスクキルモード' : 'タブキルモード'}
        </div>
      </div>
    </div>
  );
}
