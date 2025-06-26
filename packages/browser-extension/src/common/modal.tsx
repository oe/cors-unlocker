import { useEffect, useState, useRef, type ReactNode, type PropsWithChildren } from 'react';
import { XIcon } from 'lucide-react';

export interface IModalProps {
  title: ReactNode;
  visible: boolean;
  maskClosable?: boolean;
  onClose?: () => void;
  onOk?: () => void;
  okText?: ReactNode;
  cancelText?: ReactNode;
  footer?: ReactNode | false;
}

export function Modal(props: PropsWithChildren<IModalProps>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(props.visible);
  
  useEffect(() => {
    if (props.visible) {
      setIsVisible(true);
    } else {
      // Add a small delay before hiding to allow for smooth transitions
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [props.visible]);

  useEffect(() => {
    const root = rootRef.current
    if (!root || !props.maskClosable) return;

    // close modal when press ESC on none input element
    const onKeyUp = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === 'Escape' && target.tagName !== 'INPUT') {
        props.onClose?.();
      }
    }

    const onClickMask = (e: MouseEvent) => {
      if (e.target === root) {
        props.onClose?.();
      }
    }
    root.addEventListener('keyup', onKeyUp);
    root.addEventListener('click', onClickMask);
    return () => {
      root.removeEventListener('click', onClickMask);
      root.removeEventListener('keyup', onKeyUp);
    }
    
  }, [props.maskClosable, isVisible]);

  if (!isVisible) return null;

  const onOK = props.onOk || props.onClose;

  return (
  // <!-- Main modal -->
  <div ref={rootRef} tabIndex={-1} className="overflow-y-auto overflow-x-hidden fixed ease-in-out duration-300  z-50 justify-center items-center w-full inset-0 flex bg-gray-500/50">
    <div className="relative p-4 w-full max-w-2xl max-h-full ease-in-out duration-300">
      <div className="relative bg-white rounded-lg shadow">
        <div className="flex items-center justify-between p-4 md:p-5 border-b border-gray-200 rounded-t ">
          <h3 className="text-xl font-semibold text-gray-900">
            {props.title}
          </h3>
          <button type="button" className="text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm w-8 h-8 ms-auto inline-flex justify-center items-center " data-modal-hide="static-modal" onClick={props.onClose}>
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 md:p-5 space-y-4">
          {props.children}
        </div>
        {props.footer === false ? null : props.footer || (<div className="flex justify-end items-center p-4 md:p-5 border-t border-gray-200 rounded-b ">
          {(props.cancelText) && <button data-modal-hide="static-modal" type="button" className="py-2.5 px-5 ms-3 text-sm font-medium text-gray-900 focus:outline-none bg-white rounded-lg border border-gray-200 hover:bg-gray-100 hover:text-blue-700 focus:z-10 focus:ring-4 focus:ring-gray-100 " onClick={props.onClose}>
            {props.cancelText}
          </button>}
          {(props.okText || onOK) && <button data-modal-hide="static-modal" type="button" className="text-white bg-blue-500 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center " onClick={onOK}>
            {props.okText || 'OK'}
          </button>}
        </div>)}
      </div>
    </div>
  </div>)

}