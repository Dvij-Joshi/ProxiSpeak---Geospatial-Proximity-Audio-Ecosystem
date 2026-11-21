import { useEffect, useRef } from 'react';

export function DialogFrame({title,onClose,busy=false,children,className="hub-dialog"}) {
  const ref=useRef(null);
  useEffect(()=>{
    const modal=ref.current, previous=document.activeElement;
    modal.showModal();
    return ()=>{modal.close();previous?.focus();};
  },[]);
  return <dialog className={className} ref={ref} aria-label={title}
    onCancel={e=>{e.preventDefault();if(!busy)onClose();}}
    onClick={e=>{if(e.target===ref.current && !busy)onClose();}}>
    {children}
  </dialog>;
}

export default function Dialog({title,onClose,busy=false,children}) {
  return <DialogFrame title={title} onClose={onClose} busy={busy}>
    <div><header><h2>{title}</h2><button type="button" disabled={busy} aria-label="Close dialog" onClick={onClose}>&times;</button></header>{children}</div>
  </DialogFrame>;
}
