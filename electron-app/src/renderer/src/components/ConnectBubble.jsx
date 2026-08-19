import bubbleImg from '../assets/bubble.png';

export default function ConnectBubble({ isConn, onClick, boxColor, displayText }) {
  return (
    <div
      onClick={!isConn ? onClick : null}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
      className="connect-btn"
      style={{ position: 'absolute', top: '-20px', left: '-120px', width: '130px', height: '100px', backgroundImage: `url(${bubbleImg})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center', paddingBottom: '40px', zIndex: 3, cursor: !isConn ? 'pointer' : 'default', transition: 'transform 0.1s' }}
    >
      <div style={{ color: '#fff', fontSize: '14px', fontWeight: '900', letterSpacing: '1px', background: boxColor, width: '90px', minWidth: '90px', maxWidth: '90px', height: '34px', minHeight: '34px', maxHeight: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', transform: 'translateY(-2px)', whiteSpace: 'nowrap', overflow: 'hidden', boxSizing: 'border-box' }}>
        {displayText}
      </div>
    </div>
  );
}
