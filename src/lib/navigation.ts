import { FileDown, Crop, Download, ImageDown, LayoutDashboard, Scaling, SlidersHorizontal, Upload } from 'lucide-react';
export const toolNavigation = [
  { id: 'compression', label: '图片压缩', icon: ImageDown, paths: ['/', '/process', '/settings', '/export', '/comparison'], items: [
    { label: '压缩概览', path: '/', icon: LayoutDashboard },
    { label: '导入与压缩', path: '/process', icon: Upload },
    { label: '压缩设置', path: '/settings', icon: SlidersHorizontal },
    { label: '导出管理', path: '/export', icon: Download }
  ] },
  { id: 'resize', label: '图片尺寸处理', icon: Scaling, paths: ['/resize', '/resize/export'], items: [
    { label: '尺寸与裁剪', path: '/resize', icon: Crop },
    { label: '导出管理', path: '/resize/export', icon: Download }
  ] },
  { id: 'pdf', label: 'PDF 压缩', icon: FileDown, paths: ['/pdf', '/pdf/export'], items: [
    { label: '导入与压缩', path: '/pdf', icon: Upload },
    { label: '导出管理', path: '/pdf/export', icon: Download }
  ] }
];
