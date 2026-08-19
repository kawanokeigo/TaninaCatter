export default function ProcessDropdown({
  isVisible, processList, selectedProcess, onSelect, containerRef
}) {
  if (!isVisible) return null;

  return (
    <div
      ref={containerRef}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
      className="hide-scrollbar"
      style={{ position: 'absolute', top: '-225px', right: '-10px', width: '230px', height: '240px', background: 'rgba(255, 255, 255, 0.95)', border: '4px solid #2196f3', borderRadius: '12px', padding: '8px', overflowY: 'auto', zIndex: 10, boxShadow: '0 8px 16px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: '4px' }}
    >
      <div onClick={() => onSelect('')} className={selectedProcess === '' ? 'active-item' : ''} style={{ padding: '8px 12px', borderRadius: '6px', background: selectedProcess === '' ? '#2196f3' : 'transparent', color: selectedProcess === '' ? '#fff' : '#666', fontWeight: 'bold', fontSize: '14px', textAlign: 'center', borderBottom: '1px solid #ccc', marginBottom: '4px', flexShrink: 0, cursor: 'pointer' }}>
        --- 未選択 ---
      </div>
      {processList.length > 0 ? (
        processList.map((p, idx) => (
          <div key={idx} onClick={() => onSelect(p)} className={p === selectedProcess ? 'active-item' : ''} style={{ padding: '8px 12px', borderRadius: '6px', background: p === selectedProcess ? '#2196f3' : 'transparent', color: p === selectedProcess ? '#fff' : '#000', fontWeight: p === selectedProcess ? '900' : 'bold', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0, cursor: 'pointer', transition: 'background 0.2s, color 0.2s' }}>
            {p}
          </div>
        ))
      ) : (
        <div style={{ textAlign: 'center', color: '#666', marginTop: '20px', fontWeight: 'bold' }}>プロセスなし</div>
      )}
    </div>
  );
}
