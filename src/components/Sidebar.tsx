import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, HelpCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toolNavigation } from '../lib/navigation';

export default function Sidebar() {
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const current = toolNavigation.find(group => group.paths.includes(pathname));
    if (current) setCollapsed(previous => ({ ...previous, [current.id]: false }));
  }, [pathname]);
  return <div className="p-3 h-full bg-secondary/50 dark:bg-muted">
    <nav aria-label="本地工具导航" className="space-y-5">
      {toolNavigation.map(group => <div key={group.id}>
        <button className={'flex w-full items-center gap-2 rounded-lg px-3 py-3 text-sm font-semibold hover:bg-primary/10 ' + (group.paths.includes(pathname) ? 'text-primary' : '')}
          aria-expanded={!collapsed[group.id]} aria-controls={`menu-${group.id}`}
          onClick={() => setCollapsed(previous => ({ ...previous, [group.id]: !previous[group.id] }))}>
          <group.icon size={19} /><span className="flex-1 text-left">{group.label}</span><ChevronDown size={15} className={collapsed[group.id] ? '-rotate-90' : ''} />
        </button>
        {!collapsed[group.id] && <div id={`menu-${group.id}`} className="mt-1 ml-5 border-l border-border pl-2 space-y-1">
          {group.items.map(item => <Link key={item.path} to={item.path} aria-current={pathname === item.path ? 'page' : undefined}
            className={'flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors ' + (pathname === item.path ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-primary/10 hover:text-primary')}>
            <item.icon size={16} /><span>{item.label}</span>
          </Link>)}
        </div>}
      </div>)}
      <Link to="/help" aria-current={pathname === '/help' ? 'page' : undefined} className={'flex items-center gap-2 rounded-lg px-3 py-3 text-sm font-medium ' + (pathname === '/help' ? 'bg-primary text-primary-foreground' : 'hover:bg-primary/10')}><HelpCircle size={19} />使用帮助</Link>
    </nav>
    <div className="mt-7 border-t border-border pt-4 px-2 text-xs text-muted-foreground leading-6"><p className="font-medium text-foreground">LocalSqueeze 本地文件工具</p><p>图片压缩 · 尺寸处理 · PDF 压缩</p><p>本机处理，文件无需上传</p></div>
  </div>;
}
