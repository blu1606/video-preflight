import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Button as ShadcnButton } from './ui/button';

export function Button({ children, className = '', variant = 'secondary', ...props }) {
  return <ShadcnButton variant="outline" className={`button ${variant} ${className}`} {...props}>{children}</ShadcnButton>;
}

export function Modal({ open, onOpenChange, title, description, children, wide = false }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay" />
      <Dialog.Content className={`dialog-content ${wide ? 'wide' : ''}`}>
        <header className="dialog-header"><div><Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>{description || 'Chi tiết và nguồn dữ liệu của mục đang chọn.'}</Dialog.Description></div>
          <Dialog.Close className="icon-button" aria-label="Đóng"><X size={20} /></Dialog.Close></header>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

export function Json({ value }) {
  return <pre className="json">{JSON.stringify(value, null, 2)}</pre>;
}

export function Empty({ icon: Icon, title, children }) {
  return <div className="empty">{Icon && <Icon size={26} strokeWidth={1.5} />}<strong>{title}</strong><p>{children}</p></div>;
}
