import swordImg from '../assets/sword.png';

export default function Sword({ isAttacking }) {
  return (
    <>
      <style>{`
        @keyframes slash {
          0% { transform: rotate(0deg); }
          20% { transform: rotate(-15deg); }
          50% { transform: rotate(75deg); }
          100% { transform: rotate(0deg); }
        }
        .sword-attack { animation: slash 0.3s ease-out; }
      `}</style>
      <img
        src={swordImg}
        alt="sword"
        className={isAttacking ? 'sword-attack' : ''}
        style={{
          position: 'absolute', bottom: '-5px', left: '-100px', width: '150px', zIndex: 2, pointerEvents: 'none',
          transformOrigin: '20% 80%'
        }}
      />
    </>
  );
}
