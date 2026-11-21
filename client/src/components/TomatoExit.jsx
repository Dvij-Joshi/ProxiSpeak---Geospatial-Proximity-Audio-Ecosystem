export default function TomatoExit() {
  return <div className="tomato-exit" role="alert">
    <svg className="tomato-pile" viewBox="0 0 440 245" aria-hidden="true">
      <defs>
        <g id="crushed-fruit" stroke="#57271f" strokeWidth="3" strokeLinejoin="round">
          <path fill="#b33125" d="M-54 2Q-63-18-42-31Q-26-44-7-33Q13-44 36-30Q59-27 61-5Q64 14 44 22Q26 35 10 25Q-8 35-27 25Q-49 28-54 2Z"/>
          <path fill="#ef5738" d="M-56-6Q-54-26-32-26Q-15-38-3-28Q19-40 33-25Q54-27 57-9Q37 7 17 1Q-1 18-15 3Q-36 12-56-6Z"/>
          <path fill="#426651" d="m-5-22-19-9 16 2-6-13 13 12 10-16-4 17 23-3-18 9 11 6-19-4-13 8z"/>
          <path fill="none" stroke="#ff9670" strokeWidth="5" strokeLinecap="round" d="M-44-12q5-9 14-10"/>
        </g>
        <g id="tomato-slice" stroke="#703124" strokeWidth="3">
          <path fill="#c53c2a" d="M-50 1q0-27 38-30 31-8 56 12 15 23-12 37-32 19-66 4Q-48 18-50 1Z"/>
          <path fill="#ff9761" d="M-47-5q4-22 37-24 33-4 53 11 8 16-14 29-33 14-60 4-19-8-16-20Z"/>
          <path fill="#c9442e" stroke="none" d="M-37-7q5-13 23-13l6 14q-14 14-29-1Zm38-15q22-3 33 8L10-2Zm-22 29L1-3l17 9q-18 9-39 1Z"/>
          <g fill="#ffe4a0" stroke="none">{[[-27,-10],[-18,-13],[-21,-5],[11,-16],[21,-13],[15,-9],[-5,6],[4,5]].map(([x,y])=><ellipse key={x} cx={x} cy={y} rx="3.3" ry="1.7" transform={`rotate(-23 ${x} ${y})`}/>)}</g>
        </g>
      </defs>
      <path className="tomato-puddle" fill="#b43929" stroke="#57271f" strokeWidth="3" d="M41 192q57-3 32-16l-30-14q46 12 72 3 100-53 219-11l47-15q-33 22-13 24l50 6-47 12q-15 9 21 17-48-3-71 5-64 23-171 1-38-7-79 0l17-10z"/>
      <g className="fruit-drop"><use href="#crushed-fruit" transform="translate(156 153) rotate(-17)"/><use href="#crushed-fruit" transform="translate(268 155) rotate(13)"/></g>
      <g className="fruit-drop fruit-late"><use href="#crushed-fruit" transform="translate(220 118) rotate(8)"/><use href="#tomato-slice" transform="translate(120 173) rotate(20)"/><use href="#tomato-slice" transform="translate(234 179) rotate(-13)"/><use href="#tomato-slice" transform="translate(322 173) rotate(-28) scale(.74)"/></g>
      <g className="juice-flecks" fill="#f06b44"><path d="M72 140q-26-4-25-15 7-7 25 15Zm300-4q22-28 27-18 2 8-27 18ZM115 96q-12-18-8-23 7-5 8 23Z"/><ellipse cx="55" cy="182" rx="10" ry="3"/><ellipse cx="382" cy="202" rx="8" ry="3"/></g>
    </svg><strong>You have been thrown out!</strong>
  </div>;
}
