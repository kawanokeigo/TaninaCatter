export default function BlacklistModal({
  isOpen, onClose, targetMode, blacklist, rawProcessList, onAdd, onRemove
}) {
  if (!isOpen) return null;

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
      className="hide-scrollbar"
      style={{
        position: 'absolute', top: '-260px', right: '-5px', width: '250px', height: '240px',
        background: 'rgba(255, 255, 255, 0.98)', border: '4px solid #444', borderRadius: '12px',
        padding: '12px', display: 'flex', flexDirection: 'column', zIndex: 20,
        boxShadow: '0 8px 16px rgba(0,0,0,0.3)', WebkitAppRegion: 'no-drag'
      }}
    >
      <div style={{ fontWeight: '900', fontSize: '13px', borderBottom: '2px solid #ccc', paddingBottom: '5px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: targetMode === 'process' ? '#000' : '#2196f3' }}>
          {targetMode === 'process' ? 'PCプロセス 除外リスト' : 'Chromeタブ 除外リスト'}
        </span>
        <button onClick={onClose} style={{ cursor: 'pointer', background: 'transparent', border: 'none', fontWeight: 'bold', color: '#ff4500', fontSize: '16px' }}>✕</button>
      </div>

      <div className="hide-scrollbar" style={{ flex: 1, overflowY: 'auto', marginBottom: '10px' }}>
        {blacklist.map(item => (
          <div key={item} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f0f0f0', padding: '6px 8px', borderRadius: '4px', marginBottom: '4px', fontSize: '12px', border: '1px solid #ddd' }}>
            <span style={{ color: '#000', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '150px', fontWeight: 'bold' }}>{item}</span>
            <button onClick={() => onRemove(item)} style={{ cursor: 'pointer', background: '#ff4500', color: '#fff', border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '10px', fontWeight: 'bold' }}>削除</button>
          </div>
        ))}
        {blacklist.length === 0 && (
          <div style={{ color: '#999', fontSize: '12px', textAlign: 'center', marginTop: '30px', fontWeight: 'bold' }}>リストは空です</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '5px' }}>
        <select
          id="bl-select"
          style={{ color: '#000', flex: 1, fontSize: '12px', padding: '6px', borderRadius: '4px', border: '1px solid #ccc', maxWidth: '170px' }}
        >
          <option value="">▼ 追加する項目を選択</option>
          {rawProcessList
            .filter(p => !blacklist.includes(p))
            .map(p => (
              <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <button
          onClick={() => {
            const val = document.getElementById('bl-select').value;
            if(val) onAdd(val);
            document.getElementById('bl-select').value = "";
          }}
          style={{ cursor: 'pointer', background: '#2196f3', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px 10px', fontWeight: 'bold', fontSize: '12px' }}
        >追加</button>
      </div>
    </div>
  );
}
