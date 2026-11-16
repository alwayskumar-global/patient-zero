import type {Metadata} from 'next';
import '@fontsource/ibm-plex-sans/400.css';import '@fontsource/ibm-plex-sans/500.css';import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';import '@fontsource/ibm-plex-mono/600.css';
import './design.css';import './globals.css';
import {Shell} from '@/components/shell';
export const metadata:Metadata={title:'Patient Zero',description:'Local supply-chain replay and exact lockfile evidence paths. Experimental policy; measured limitations remain visible.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" data-theme="dark"><body><Shell>{children}</Shell></body></html>;}
