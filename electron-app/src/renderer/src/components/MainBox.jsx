export default function MainBox({ selectedProcess, targetMode }) {
  return (
    <div style={{ background: '#e2f9dd', border: '4px solid #000', borderRadius: '35px', padding: '20px 20px 15px 20px', position: 'relative', zIndex: 1, boxSizing: 'border-box' }}>
      <div style={{ fontWeight: '900', fontSize: '18px', color: '#000', marginBottom: '8px', marginLeft: '5px', letterSpacing: '1px' }}>
        次のキル対象
      </div>
      <div style={{ background: '#fff', border: '4px solid #000', borderRadius: '8px', padding: '0 10px', textAlign: 'center', fontSize: '18px', fontWeight: '900', color: '#000', width: '200px', maxWidth: '200px', height: '46px', lineHeight: '38px', boxSizing: 'border-box', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '1px' }}>
        {selectedProcess || '未選択'}
      </div>
      <div style={{ color: '#ff4500', fontWeight: '900', fontSize: '18px', textAlign: 'right', marginTop: '12px', marginRight: '5px', letterSpacing: '1px' }}>
        {targetMode === 'process' ? 'タスクキルモード' : 'タブキルモード'}
      </div>
    </div>
  );
}
