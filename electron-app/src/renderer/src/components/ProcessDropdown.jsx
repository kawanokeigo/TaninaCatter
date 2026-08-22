export default function ProcessDropdown({
  isVisible,
  processList,
  selectedProcess,
  onSelect,
  containerRef
}) {
  if (!isVisible) return null;

  return (
    <div
      ref={containerRef}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
      className="hide-scrollbar"
      style={{
        position: 'absolute',
        top: '-225px',
        right: '-10px',

        width: '230px',
        height: '240px',

        background: 'rgba(255, 255, 255, 0.98)',

        border: '4px solid #2196f3',
        borderRadius: '18px',

        padding: '8px',
        overflowY: 'auto',

        zIndex: 10,

        boxShadow: '0 8px 16px rgba(0, 0, 0, 0.2)',

        display: 'flex',
        flexDirection: 'column',
        gap: '4px',

        boxSizing: 'border-box',

        WebkitAppRegion: 'no-drag',
      }}
    >
      {/* 未選択 */}
      <div
        className={selectedProcess === '' ? 'active-item' : ''}
        onClick={() => onSelect('')}
        style={{
          padding: '8px 12px',
          borderRadius: '8px',

          background:
            selectedProcess === ''
              ? '#2196f3'
              : 'transparent',

          color:
            selectedProcess === ''
              ? '#fff'
              : '#555',

          fontWeight: '900',
          fontSize: '14px',
          textAlign: 'center',

          borderBottom: '1px solid #ccc',
          marginBottom: '4px',

          flexShrink: 0,
          cursor: 'pointer',

          transition: 'background 0.15s, color 0.15s',
        }}
      >
        --- 未選択 ---
      </div>

      {/* プロセス一覧 */}
      {processList.length > 0 ? (
        processList.map((p, idx) => {
          const isSelected = p === selectedProcess;

          return (
            <div
              key={idx}
              className={isSelected ? 'active-item' : ''}
              onClick={() => onSelect(p)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',

                // 通常は透明、選択したものだけ青
                background: isSelected
                  ? '#2196f3'
                  : 'transparent',

                color: isSelected
                  ? '#fff'
                  : '#000',

                fontWeight: isSelected
                  ? '900'
                  : 'bold',

                fontSize: '14px',

                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',

                flexShrink: 0,
                cursor: 'pointer',

                transition:
                  'background 0.15s, color 0.15s',
              }}
            >
              {p}
            </div>
          );
        })
      ) : (
        <div
          style={{
            textAlign: 'center',
            color: '#666',
            marginTop: '20px',
            fontWeight: 'bold',
            fontSize: '13px',
          }}
        >
          プロセスなし
        </div>
      )}
    </div>
  );
}
