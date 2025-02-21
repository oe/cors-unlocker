import {
  Handshake,
  CodeXml,
  Fingerprint,
  Package,
  Chrome,
  LocateFixed
} from 'lucide-react';

export const featureItems = [
  {
    icon: LocateFixed,
    color: 'text-blue-500',
    title: 'Easy CORS Management',
    description:
      'Enable or disable CORS for specific websites easily via the extension or npm package.'
  },
  {
    icon: CodeXml,
    color: 'text-green-500',
    title: 'Open Source',
    description:
      <>Fully open source for transparency and community contributions on <a className="text-slate-400" target="_blank" rel="noreferrer" href="https://github.com/oe/cors-unlocker">GitHub</a>.</>
  },
  {
    icon: Package,
    color: 'text-rose-900',
    title: 'Developer-Friendly npm Package',
    description:
      'Programmatically control CORS with our powerful npm package and avoid production errors.'
  },
  {
    icon: Fingerprint,
    color: 'text-blue-500',
    title: 'Secure & Privacy-Focused',
    description:
      'Prioritizes user security and privacy, with no sensitive data collection.'
  },
  {
    icon: Handshake,
    color: 'text-green-500',
    title: 'Lightweight & Easy to Use',
    description: "Simple, intuitive, and doesn't impact browser performance."
  },
  {
    icon: Chrome,
    color: 'text-orange-800',
    title: 'Cross-Browser Support',
    description:
      'Works seamlessly with Chrome, Firefox, Edge, and other major browsers.'
  },
];

export function RenderNode({node}: {node: any}) {
  return <>{node}</>
}
