import React, { useState } from 'react';

export default function VirtualM5Controller({ onCommand, isConn }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div style={{
      position: 'fixed',
      bottom: '10px',
      left: '10px',
      zIndex: 9999,
      fontFamily: 'sans-serif',
      fontSize: '11px'
    }}>
      {/* 普段は小さなフローティングボタン */}
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          style={{
            background: 'rgba(0, 0, 0, 0.85)',
            color: '#ffb300',
            border: '1px solid #555',
            padding: '6px 10px',
            borderRadius: '20px',
            cursor: 'pointer',
            fontWeight: 'bold',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            display: 'flex',
            alignItem: 'center',
            gap: '4px'
          }}
        >
          🎮 仮想M5 ({isConn ? '接続中' : '未接続'})
        </button>
      ) : (
        /* 開いたときだけ出るパネル */
        <div style={{
          background: 'rgba(0, 0, 0, 0.9)',
          color: '#fff',
          padding: '10px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          border: '1px solid #555',
          width: '200px'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#ffb300', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>🎮 仮想M5コントローラー</span>
            <button
              onClick={() => setIsOpen(false)}
              style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '12px' }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', marginBottom: '6px' }}>
            <button onClick={() => onCommand('0')} style={btnStyle('#4caf50')}>0:SAFE</button>
            <button onClick={() => onCommand('1')} style={btnStyle('#2196f3')}>1:SEL</button>
            <button onClick={() => onCommand('2')} style={btnStyle('#ff4500')}>2:KILL</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', marginBottom: '6px' }}>
            <button onClick={() => onCommand('U')} style={btnStyle('#444')}>⬆</button>
            <button onClick={() => onCommand('D')} style={btnStyle('#444')}>⬇</button>
            <button onClick={() => onCommand('K')} style={btnStyle('#d32f2f')}>⚔(K)</button>
            <button onClick={() => onCommand('L')} style={btnStyle('#444')}>🎯</button>
          </div>
        </div>
      )}
    </div>
  );
}

const btnStyle = (bg) => ({
  background: bg,
  color: '#fff',
  border: 'none',
  padding: '4px 2px',
  borderRadius: '3px',
  cursor: 'pointer',
  fontWeight: 'bold',
  fontSize: '10px'
});
