import bubbleImg from '../assets/Bubble.svg';

export default function ConnectBubble({
  isConn,
  onClick,
  boxColor,
  displayText
}) {
  return (
    <div
      onClick={!isConn ? onClick : null}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
      className="connect-btn"
      style={{
        position: 'absolute',

        // 剣と少し離す
        top: '-20px',
        left: '-145px',

        // 元と同じくらいの全体サイズ
        width: '130px',
        height: '100px',

        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',

        zIndex: 3,

        cursor: !isConn ? 'pointer' : 'default',
        transition: 'transform 0.1s',

        WebkitAppRegion: 'no-drag',
      }}
    >
      {/* 黄色い吹き出し */}
      <img
        src={bubbleImg}
        alt="bubble"
        style={{
          position: 'absolute',
          width: '130px',
          height: '100px',
          objectFit: 'contain',
          left: 0,
          top: 0,
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />

      {/* SAFE / SELECT / KILL / 未接続 */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,

          color: '#fff',

          // 少し大きくする
          fontSize: '14px',
          fontWeight: '900',
          letterSpacing: '1px',

          // App.jsxから渡された色を使用
          background: boxColor,

          width: '100px',
          height: '40px',

          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',

          borderRadius: '6px',

          // 吹き出しの真ん中に配置
          transform: 'translateY(-18px)',

          whiteSpace: 'nowrap',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {displayText}
      </div>
    </div>
  );
}
