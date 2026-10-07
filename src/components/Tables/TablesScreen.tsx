import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, RestaurantTable, NetworkOrder, AppSettings, ensureDefaultTables } from '../../lib/db';
import { formatCurrency } from '../../lib/utils';
import { 
  QrCode, Plus, Edit2, Trash2, Printer, Download, Copy, Check, 
  Wifi, Tablet, ExternalLink, RefreshCw, Send, CheckCircle2, 
  XCircle, Clock, AlertTriangle, Bell, Search, Layers, X, Smartphone
} from 'lucide-react';
import QRCode from 'qrcode';
import { getNetworkInfo, NetworkInfo, updateNetworkOrderStatus, isLocalhostOrTauri } from '../../lib/networkSync';
import { useAuth } from '../../context/AuthContext';
import MobileAppQrModal from '../Common/MobileAppQrModal';

export default function TablesScreen({
  onLoadOrderToPos
}: {
  onLoadOrderToPos?: (order: NetworkOrder) => void;
}) {
  const { can } = useAuth();
  const tables = useLiveQuery(() => db.restaurantTables.toArray());
  const pendingOrders = useLiveQuery(() => db.networkOrders.orderBy('createdAt').reverse().toArray());
  const settings = useLiveQuery(() => db.settings.toCollection().first());

  const [activeSubTab, setActiveSubTab] = useState<'tables' | 'orders' | 'network'>('tables');
  const [activeSectionFilter, setActiveSectionFilter] = useState<string>('all');
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);

  // Table Modal
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null);
  const [tableForm, setTableForm] = useState<{
    number: number;
    title: string;
    section: string;
    capacity: number;
    status: 'empty' | 'occupied' | 'reserved' | 'needs_waiter';
  }>({
    number: 1,
    title: 'میز ۱',
    section: 'سالن اصلی',
    capacity: 4,
    status: 'empty'
  });

  // Single QR Code Modal
  const [qrModalTable, setQrModalTable] = useState<RestaurantTable | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Batch Print Preview
  const [isBatchPrintOpen, setIsBatchPrintOpen] = useState(false);
  const [batchQrCodes, setBatchQrCodes] = useState<Record<number, string>>({});

  // Wi-Fi edit states
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [customServerUrl, setCustomServerUrl] = useState('');
  const [wifiSaved, setWifiSaved] = useState(false);
  const [isMobileAppQrOpen, setIsMobileAppQrOpen] = useState(false);

  // Fetch Network Info
  const refreshNetworkInfo = () => {
    getNetworkInfo(settings?.localServerPort).then(info => {
      setNetworkInfo(info);
    });
  };

  useEffect(() => {
    ensureDefaultTables();
    refreshNetworkInfo();
  }, [settings?.localServerPort]);

  useEffect(() => {
    if (settings) {
      setWifiSsid(settings.wifiSsid || '');
      setWifiPassword(settings.wifiPassword || '');
      setCustomServerUrl(settings.localServerUrl || '');
    }
  }, [settings]);

  // Compute Base URL for QR codes
  const baseMenuUrl = useMemo(() => {
    if (customServerUrl.trim()) {
      let url = customServerUrl.trim().replace(/\/$/, '');
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `http://${url}`;
      }
      return url;
    }
    const port = settings?.localServerPort || networkInfo?.port || 3000;
    const validIps = (networkInfo?.localIps || []).filter(
      ip => !ip.startsWith('127.') && ip !== '0.0.0.0' && !ip.includes('localhost')
    );
    const ip = validIps.length > 0 ? validIps[0] : '192.168.1.100';

    const hostname = window.location.hostname;
    if (hostname && !isLocalhostOrTauri(hostname) && hostname.includes('.')) {
      return window.location.origin + window.location.pathname.replace(/\/$/, '');
    }

    return `http://${ip}:${port}`;
  }, [networkInfo, customServerUrl, settings]);

  // Generate QR Data URL when single QR modal opens
  useEffect(() => {
    if (qrModalTable) {
      const url = `${baseMenuUrl}?mode=menu&table=${qrModalTable.number}`;
      QRCode.toDataURL(url, {
        width: 320,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      }).then(dataUrl => {
        setQrDataUrl(dataUrl);
      }).catch(err => {
        console.error('QR generation error', err);
      });
    }
  }, [qrModalTable, baseMenuUrl]);

  // Generate Batch QR codes when batch modal opens
  useEffect(() => {
    if (isBatchPrintOpen && tables) {
      const promises = tables.map(tbl => {
        const url = `${baseMenuUrl}?mode=menu&table=${tbl.number}`;
        return QRCode.toDataURL(url, {
          width: 250,
          margin: 1,
          color: { dark: '#0f172a', light: '#ffffff' }
        }).then(dataUrl => ({ number: tbl.number, dataUrl }));
      });

      Promise.all(promises).then(results => {
        const map: Record<number, string> = {};
        results.forEach(r => { map[r.number] = r.dataUrl; });
        setBatchQrCodes(map);
      });
    }
  }, [isBatchPrintOpen, tables, baseMenuUrl]);

  // Sections
  const sections = useMemo(() => {
    if (!tables) return [];
    const set = new Set<string>();
    tables.forEach(t => {
      if (t.section) set.add(t.section);
    });
    return Array.from(set);
  }, [tables]);

  const filteredTables = useMemo(() => {
    if (!tables) return [];
    if (activeSectionFilter === 'all') return tables;
    return tables.filter(t => t.section === activeSectionFilter);
  }, [tables, activeSectionFilter]);

  const pendingOrdersCount = useMemo(() => {
    return pendingOrders?.filter(o => o.status === 'pending').length || 0;
  }, [pendingOrders]);

  // Open add table
  const handleOpenAddTable = () => {
    setEditingTable(null);
    const nextNum = tables && tables.length > 0 ? Math.max(...tables.map(t => t.number)) + 1 : 1;
    setTableForm({
      number: nextNum,
      title: `میز ${nextNum}`,
      section: 'سالن اصلی',
      capacity: 4,
      status: 'empty'
    });
    setIsTableModalOpen(true);
  };

  // Open edit table
  const handleOpenEditTable = (table: RestaurantTable) => {
    setEditingTable(table);
    setTableForm({
      number: table.number,
      title: table.title,
      section: table.section || 'سالن اصلی',
      capacity: table.capacity || 4,
      status: table.status || 'empty'
    });
    setIsTableModalOpen(true);
  };

  const handleSaveTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableForm.title.trim() || tableForm.number <= 0) return;

    if (editingTable?.id) {
      await db.restaurantTables.update(editingTable.id, {
        number: tableForm.number,
        title: tableForm.title.trim(),
        section: tableForm.section.trim(),
        capacity: Number(tableForm.capacity),
        status: tableForm.status
      });
    } else {
      await db.restaurantTables.add({
        number: tableForm.number,
        title: tableForm.title.trim(),
        section: tableForm.section.trim(),
        capacity: Number(tableForm.capacity),
        status: tableForm.status,
        createdAt: new Date()
      });
    }

    setIsTableModalOpen(false);
  };

  const handleDeleteTable = async (id?: number) => {
    if (!id) return;
    if (window.confirm('آیا از حذف این میز اطمینان دارید؟')) {
      await db.restaurantTables.delete(id);
    }
  };

  const handleSaveWifi = async () => {
    if (settings?.id) {
      await db.settings.update(settings.id, {
        wifiSsid: wifiSsid.trim(),
        wifiPassword: wifiPassword.trim(),
        localServerUrl: customServerUrl.trim()
      });
      setWifiSaved(true);
      setTimeout(() => setWifiSaved(false), 3000);
    }
  };

  const handleCopyLink = (tableNum: number) => {
    const url = `${baseMenuUrl}?mode=menu&table=${tableNum}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleDownloadQr = (tableNum: number) => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `QR-Table-${tableNum}.png`;
    a.click();
  };

  const handleAcceptOrder = async (order: NetworkOrder) => {
    if (order.id) {
      await updateNetworkOrderStatus(order.id, order.tempId, 'accepted');
    }
    if (onLoadOrderToPos) {
      onLoadOrderToPos(order);
    }
  };

  const handleRejectOrder = async (order: NetworkOrder) => {
    if (order.id) {
      await updateNetworkOrderStatus(order.id, order.tempId, 'rejected');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-100 overflow-hidden font-sans" dir="rtl">
      
      {/* Top Header Bar */}
      <header className="bg-white border-b border-slate-200 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
            <QrCode size={22} />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-800">مدیریت میزها، بارکد و سفارشات تحت شبکه</h1>
            <p className="text-xs text-slate-500">ساخت بارکد QR منو، سفارش‌گیری تبلت گارسون و اتصال به کامپیوتر صندوق</p>
          </div>
        </div>

        {/* Sub-tab Navigation */}
        <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs font-bold">
          <button
            onClick={() => setActiveSubTab('tables')}
            className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
              activeSubTab === 'tables'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            میزها و بارکد ({tables?.length || 0})
          </button>

          <button
            onClick={() => setActiveSubTab('orders')}
            className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer relative flex items-center gap-1.5 ${
              activeSubTab === 'orders'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            <span>سفارشات شبکه</span>
            {pendingOrdersCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center animate-pulse">
                {pendingOrdersCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveSubTab('network')}
            className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
              activeSubTab === 'network'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            شبکه و اتصال تبلت
          </button>
        </div>
      </header>

      {/* SUB-TAB 1: TABLES & QR CODES */}
      {activeSubTab === 'tables' && (
        <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
          
          {/* Action Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 shrink-0">
            {/* Sections filter */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setActiveSectionFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeSectionFilter === 'all'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                همه ({tables?.length || 0})
              </button>
              {sections.map(sec => (
                <button
                  key={sec}
                  onClick={() => setActiveSectionFilter(sec)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    activeSectionFilter === sec
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {sec}
                </button>
              ))}
            </div>

            {/* Print all & Add table */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setIsMobileAppQrOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold shadow-2xs transition-all cursor-pointer"
                title="نمایش کیوآر اختصاصی اتصال گوشی به کل برنامه و PWA"
              >
                <Smartphone size={15} />
                <span>کیوآر اتصال گوشی (PWA)</span>
              </button>

              <button
                onClick={() => setIsBatchPrintOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                <Printer size={15} />
                <span>چاپ گروهی بارکد میزها (A4)</span>
              </button>

              {can('tables_manage') && (
                <button
                  onClick={handleOpenAddTable}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                >
                  <Plus size={16} />
                  <span>افزودن میز جدید</span>
                </button>
              )}
            </div>
          </div>

          {/* Tables Grid */}
          <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pr-1">
            {filteredTables.map(tbl => {
              const isOccupied = tbl.status === 'occupied';
              const needsWaiter = tbl.status === 'needs_waiter';
              const isReserved = tbl.status === 'reserved';

              let statusBadge = { text: 'میز خالی', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
              if (needsWaiter) {
                statusBadge = { text: 'فراخوانی گارسون!', bg: 'bg-rose-500 text-white border-rose-500 font-bold animate-pulse' };
              } else if (isOccupied) {
                statusBadge = { text: 'مشغول', bg: 'bg-amber-50 text-amber-700 border-amber-200' };
              } else if (isReserved) {
                statusBadge = { text: 'رزرو شده', bg: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
              }

              return (
                <div 
                  key={tbl.id}
                  className="bg-white rounded-3xl border border-slate-200/90 p-4.5 flex flex-col justify-between shadow-xs hover:shadow-md transition-shadow relative"
                >
                  {/* Top: Section and Status */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-bold text-slate-500 px-2 py-0.5 rounded-lg bg-slate-100">
                      {tbl.section}
                    </span>
                    <span className={`text-[11px] px-2.5 py-0.5 rounded-full border ${statusBadge.bg}`}>
                      {statusBadge.text}
                    </span>
                  </div>

                  {/* Middle: Title & Capacity */}
                  <div className="my-2 text-center">
                    <h3 className="text-xl font-black text-slate-800">{tbl.title}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">ظرفیت: {tbl.capacity} نفر</p>
                  </div>

                  {/* QR Code Action Button */}
                  <div className="my-3 pt-3 border-t border-slate-100">
                    <button
                      onClick={() => setQrModalTable(tbl)}
                      className="w-full py-2.5 rounded-2xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer group"
                    >
                      <QrCode size={16} className="group-hover:scale-110 transition-transform" />
                      <span>مشاهده و چاپ بارکد QR</span>
                    </button>
                  </div>

                  {/* Footer Actions: Edit / Delete */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
                    <div className="flex items-center gap-1">
                      {can('tables_manage') && (
                        <>
                          <button
                            onClick={() => handleOpenEditTable(tbl)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
                            title="ویرایش میز"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            onClick={() => handleDeleteTable(tbl.id)}
                            className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500 cursor-pointer"
                            title="حذف میز"
                          >
                            <Trash2 size={15} />
                          </button>
                        </>
                      )}
                    </div>

                    <a
                      href={`${baseMenuUrl}?mode=menu&table=${tbl.number}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-blue-600 font-medium"
                      title="مشاهده مستقیم منو"
                    >
                      <span>تست منو</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      )}

      {/* SUB-TAB 2: NETWORK ORDERS (TABLET & QR ORDERS) */}
      {activeSubTab === 'orders' && (
        <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div>
              <h2 className="text-base font-black text-slate-800">سفارشات زنده دریافتی از تبلت‌ها و بارکدها</h2>
              <p className="text-xs text-slate-500">سفارش‌های ثبت شده سر میزها به صورت زنده در این بخش نمایش داده می‌شوند.</p>
            </div>
            
            <button
              onClick={() => db.networkOrders.clear()}
              className="px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition-all cursor-pointer"
            >
              پاک‌سازی تاریخچه سفارشات شبکه
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {!pendingOrders || pendingOrders.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 p-8">
                <Tablet size={40} className="mx-auto text-slate-300 mb-3" />
                <h3 className="font-bold text-slate-700 text-sm">هیچ سفارش آنلاینی در صف وجود ندارد</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  هنگامی که مشتریان بارکد روی میز را اسکن کرده و سفارش دهند یا گارسون با تبلت سفارش ثبت کند، فوراً همراه با آلارم صوتی در این قسمت نمایش می‌یابد.
                </p>
              </div>
            ) : (
              pendingOrders.map(order => {
                const isPending = order.status === 'pending';
                const isAccepted = order.status === 'accepted';
                const isRejected = order.status === 'rejected';

                let statusBadge = 'bg-amber-100 text-amber-800 border-amber-300';
                let statusLabel = 'در انتظار بررسی';
                if (isAccepted) {
                  statusBadge = 'bg-emerald-100 text-emerald-800 border-emerald-300';
                  statusLabel = 'تایید شده و ارسال به صندوق';
                } else if (isRejected) {
                  statusBadge = 'bg-rose-100 text-rose-800 border-rose-300';
                  statusLabel = 'رد شده';
                }

                return (
                  <div 
                    key={order.id || order.tempId}
                    className={`bg-white rounded-2xl border p-4.5 shadow-xs transition-all ${
                      isPending ? 'border-amber-300 ring-2 ring-amber-200/50' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2.5">
                        <span className="px-3 py-1 rounded-xl bg-blue-600 text-white font-black text-xs shadow-xs">
                          {order.tableTitle || `میز ${order.tableNumber}`}
                        </span>
                        <span className={`text-[11px] px-2.5 py-0.5 rounded-full border font-bold ${statusBadge}`}>
                          {statusLabel}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          مبدا: {order.source === 'waiter_tablet' ? `گارسون (${order.waiterName || 'پرسنل'})` : 'بارکد مشتری سر میز'}
                        </span>
                      </div>

                      <div className="text-left text-xs font-mono text-slate-500">
                        {order.createdAt ? new Date(order.createdAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
                      </div>
                    </div>

                    {/* Items table */}
                    <div className="my-3 space-y-1.5">
                      <div className="grid grid-cols-12 text-[11px] font-bold text-slate-500 pb-1 border-b border-slate-100">
                        <span className="col-span-6">نام غذا / نوشیدنی</span>
                        <span className="col-span-2 text-center">تعداد</span>
                        <span className="col-span-4 text-left">مبلغ کل</span>
                      </div>
                      {order.items.map((item, idx) => (
                        <div key={idx} className="grid grid-cols-12 text-xs text-slate-700 py-1 border-b border-dashed border-slate-100">
                          <div className="col-span-6">
                            <span className="font-bold">{item.name}</span>
                            {item.note && (
                              <span className="block text-[10px] text-amber-700 mt-0.5 bg-amber-50 px-1.5 py-0.2 rounded w-fit">
                                یادداشت: {item.note}
                              </span>
                            )}
                          </div>
                          <span className="col-span-2 text-center font-bold text-slate-900">{item.quantity}</span>
                          <span className="col-span-4 text-left font-mono font-bold text-blue-600">
                            {formatCurrency(item.price * item.quantity)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Notes & Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                      <div>
                        {order.notes && (
                          <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-xl border border-slate-100">
                            <strong>توضیحات کلی:</strong> {order.notes}
                          </p>
                        )}
                        <span className="text-xs font-black text-slate-800 block mt-1">
                          جمع سفارش: <strong className="text-blue-600">{formatCurrency(order.subtotal)}</strong>
                        </span>
                      </div>

                      {/* Action buttons */}
                      {isPending && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleRejectOrder(order)}
                            className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-all cursor-pointer"
                          >
                            رد سفارش
                          </button>

                          <button
                            onClick={() => handleAcceptOrder(order)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all cursor-pointer active:scale-95"
                          >
                            <CheckCircle2 size={16} />
                            <span>تایید و انتقال به فاکتور صندوق</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: NETWORK & TABLET CONNECTION SETTINGS */}
      {activeSubTab === 'network' && (
        <div className="flex-1 flex flex-col p-4 md:p-6 overflow-y-auto max-w-4xl mx-auto w-full">
          <div className="space-y-6">
            
            {/* Guide Card */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs">
              <h3 className="text-base font-black text-slate-800 mb-2">راهنمای اتصال تبلت و موبایل در شبکه محلی (Wi-Fi)</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                کامپیوتر صندوق شما به عنوان سرور اصلی عمل می‌کند. تبلت‌های گارسون‌ها و گوشی‌های مشتریان تنها با اتصال به همان مودم وای‌فای رستوران می‌توانند منو را باز کرده و سفارش ثبت نمایند.
              </p>

              {/* Server IP info box */}
              <div className="mt-4 p-4 rounded-2xl bg-blue-50/70 border border-blue-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-bold text-blue-900 block">آدرس کامپیوتر در شبکه محلی:</span>
                  <span dir="ltr" className="text-base font-black text-blue-700 font-mono select-all">
                    {baseMenuUrl}
                  </span>
                  <p className="text-[11px] text-blue-600 mt-0.5">
                    (تبلت‌ها یا مرورگر گوشی‌ها کافیست این آدرس را باز نمایند)
                  </p>
                </div>

                <button
                  onClick={refreshNetworkInfo}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-blue-200 text-blue-700 text-xs font-bold hover:bg-blue-100 transition-all cursor-pointer"
                >
                  <RefreshCw size={14} />
                  <span>بروزرسانی وضعیت شبکه</span>
                </button>
              </div>
            </div>

            {/* Quick QR codes for Staff / Customer */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* QR 1: Waiter Tablet Mode */}
              <div className="bg-white rounded-3xl border border-slate-200 p-5 flex flex-col items-center text-center shadow-xs">
                <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center mb-3">
                  <Tablet size={22} />
                </div>
                <h4 className="font-black text-sm text-slate-800 mb-1">اسکن با تبلت گارسون</h4>
                <p className="text-xs text-slate-500 mb-3">برای ورود مستقیم تبلت یا موبایل پرسنل به حالت سفارش‌گیر سر میز</p>

                <div className="p-2 bg-white rounded-2xl border border-slate-200 shadow-inner mb-3">
                  <QrCodeDisplay url={`${baseMenuUrl}?mode=waiter`} size={170} />
                </div>

                <a
                  href={`${baseMenuUrl}?mode=waiter`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                >
                  <span>باز کردن صفحه سفارش‌گیر تبلت</span>
                  <ExternalLink size={13} />
                </a>
              </div>

              {/* QR 2: Customer Sample Menu */}
              <div className="bg-white rounded-3xl border border-slate-200 p-5 flex flex-col items-center text-center shadow-xs">
                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center mb-3">
                  <QrCode size={22} />
                </div>
                <h4 className="font-black text-sm text-slate-800 mb-1">تست منوی دیجیتال مشتری</h4>
                <p className="text-xs text-slate-500 mb-3">نمونه‌ای از صفحه منویی که مشتری با اسکن بارکد میز ۱ مشاهده می‌کند</p>

                <div className="p-2 bg-white rounded-2xl border border-slate-200 shadow-inner mb-3">
                  <QrCodeDisplay url={`${baseMenuUrl}?mode=menu&table=1`} size={170} />
                </div>

                <a
                  href={`${baseMenuUrl}?mode=menu&table=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                >
                  <span>مشاهده نمونه منوی دیجیتال</span>
                  <ExternalLink size={13} />
                </a>
              </div>

            </div>

            {/* Wi-Fi Settings Card */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs">
              <div className="flex items-center gap-2 mb-3">
                <Wifi size={20} className="text-blue-600" />
                <h3 className="text-sm font-black text-slate-800">تنظیمات وای‌فای رستوران (نمایش روی بارکد میزها)</h3>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                نام و رمز وای‌فای وارد شده در این بخش، به‌صورت خودکار بر روی کارت‌های بارکد میزها چاپ می‌شود تا مشتریان بتوانند به اینترنت رستوران وصل شوند.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نام شبکه وای‌فای (SSID):</label>
                  <input
                    type="text"
                    dir="ltr"
                    placeholder="مثلاً: Arka_Guest"
                    value={wifiSsid}
                    onChange={e => setWifiSsid(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رمز عبور وای‌فای:</label>
                  <input
                    type="text"
                    dir="ltr"
                    placeholder="مثلاً: 12345678"
                    value={wifiPassword}
                    onChange={e => setWifiPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Custom server URL override */}
              <div className="mt-4 pt-3 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  آدرس اختصاصی سرور / دامنه (اختیاری):
                </label>
                <input
                  type="text"
                  dir="ltr"
                  placeholder="http://192.168.1.100:3000 یا https://menu.myrestaurant.ir"
                  value={customServerUrl}
                  onChange={e => setCustomServerUrl(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  در صورت خالی بودن، آدرس به‌صورت خودکار از شبکه تشخیص داده می‌شود.
                </span>
              </div>

              <div className="mt-4 flex items-center justify-between">
                {wifiSaved && (
                  <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 size={16} />
                    <span>تنظیمات با موفقیت ذخیره شد.</span>
                  </span>
                )}
                <button
                  onClick={handleSaveWifi}
                  className="mr-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                >
                  ذخیره اطلاعات وای‌فای و سرور
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT TABLE */}
      {isTableModalOpen && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsTableModalOpen(false)}
        >
          <div 
            className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <h3 className="font-black text-base text-slate-800">
                {editingTable ? 'ویرایش مشخصات میز' : 'افزودن میز جدید'}
              </h3>
              <button onClick={() => setIsTableModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveTable} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">شماره عددی میز:</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={tableForm.number}
                  onChange={e => setTableForm({ ...tableForm, number: parseInt(e.target.value) || 1 })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">عنوان / نام نمایشی میز:</label>
                <input
                  type="text"
                  required
                  placeholder="مثلاً: میز ۱، آلاچیق ۲، VIP"
                  value={tableForm.title}
                  onChange={e => setTableForm({ ...tableForm, title: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">بخش / سالن:</label>
                <input
                  type="text"
                  required
                  placeholder="مثلاً: سالن اصلی، تراس، حیاط، روف گاردن"
                  value={tableForm.section}
                  onChange={e => setTableForm({ ...tableForm, section: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ظرفیت صندلی (نفر):</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={tableForm.capacity}
                  onChange={e => setTableForm({ ...tableForm, capacity: parseInt(e.target.value) || 4 })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">وضعیت فعلی:</label>
                <select
                  value={tableForm.status}
                  onChange={e => setTableForm({ ...tableForm, status: e.target.value as any })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                >
                  <option value="empty">خالی و آماده پذیرش</option>
                  <option value="occupied">مشغول</option>
                  <option value="reserved">رزرو شده</option>
                  <option value="needs_waiter">درخواست گارسون</option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsTableModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold shadow-xs hover:bg-blue-700"
                >
                  ذخیره میز
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SINGLE TABLE QR CARD PREVIEW & PRINT */}
      {qrModalTable && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setQrModalTable(null)}
        >
          <div 
            className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <span className="font-black text-sm text-slate-800">کارت بارکد {qrModalTable.title}</span>
              <button onClick={() => setQrModalTable(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            {/* Printable Card Design Preview */}
            <div 
              id="printable-single-qr"
              className="w-full bg-gradient-to-b from-slate-50 to-white rounded-3xl border-2 border-slate-800 p-5 flex flex-col items-center shadow-md relative overflow-hidden"
            >
              {/* Header */}
              <div className="mb-2">
                <h4 className="font-black text-base text-slate-900 tracking-tight">
                  {settings?.restaurantName || 'رستوران و کافی‌شاپ'}
                </h4>
                <div className="inline-block mt-1 px-4 py-1 rounded-full bg-blue-600 text-white font-black text-sm shadow-xs">
                  {qrModalTable.title}
                </div>
              </div>

              {/* QR Image */}
              <div className="p-2 bg-white rounded-2xl border-2 border-slate-200 shadow-sm my-2">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="QR Code" className="w-48 h-48 object-contain" />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center bg-slate-50">
                    <span className="text-xs text-slate-400">در حال تولید...</span>
                  </div>
                )}
              </div>

              {/* Scan text */}
              <p className="text-[11px] font-bold text-slate-700 leading-tight px-2 mt-1">
                دوربین گوشی خود را روبه‌روی بارکد بگیرید تا منوی دیجیتال و قیمت‌ها را مشاهده نمایید.
              </p>

              {/* Wi-Fi Details if available */}
              {(settings?.wifiSsid || settings?.phone) && (
                <div className="w-full mt-3 pt-2.5 border-t border-dashed border-slate-300 text-[10px] text-slate-600 flex flex-col items-center gap-1">
                  {settings?.wifiSsid && (
                    <div className="flex items-center gap-1 font-mono">
                      <Wifi size={12} className="text-blue-600" />
                      <span>Wi-Fi: <strong>{settings.wifiSsid}</strong></span>
                      {settings.wifiPassword && (
                        <span>| رمز: <strong>{settings.wifiPassword}</strong></span>
                      )}
                    </div>
                  )}
                  {settings?.phone && (
                    <span dir="ltr" className="font-mono text-slate-500">تلفن: {settings.phone}</span>
                  )}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="w-full grid grid-cols-3 gap-2 mt-5">
              <button
                onClick={() => handleCopyLink(qrModalTable.number)}
                className="py-2.5 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                title="کپی لینک مستقیم منو"
              >
                {copiedLink ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                <span>{copiedLink ? 'کپی شد' : 'کپی لینک'}</span>
              </button>

              <button
                onClick={() => handleDownloadQr(qrModalTable.number)}
                className="py-2.5 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                title="دانلود عکس بارکد"
              >
                <Download size={14} />
                <span>دانلود عکس</span>
              </button>

              <button
                onClick={() => window.print()}
                className="py-2.5 px-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                title="چاپ کارت میز"
              >
                <Printer size={14} />
                <span>چاپ کارت</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BATCH PRINT ALL TABLE CARDS (A4 GRID) */}
      {isBatchPrintOpen && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setIsBatchPrintOpen(false)}
        >
          <div 
            className="w-full max-w-4xl bg-white rounded-3xl p-6 shadow-2xl my-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <div>
                <h3 className="font-black text-base text-slate-800">چاپ گروهی بارکد تمامی میزها (قالب استند و برچسب)</h3>
                <p className="text-xs text-slate-500">آماده چاپ روی برگه A4 جهت برش و قرار دادن داخل استندهای روی میز</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold shadow-xs hover:bg-blue-700 cursor-pointer"
                >
                  <Printer size={16} />
                  <span>پرینت برگه</span>
                </button>
                <button onClick={() => setIsBatchPrintOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Batch Cards Grid for Print */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-h-[70vh] overflow-y-auto p-2">
              {tables?.map(tbl => (
                <div 
                  key={tbl.id}
                  className="border-2 border-dashed border-slate-300 rounded-3xl p-4 flex flex-col items-center text-center bg-white"
                >
                  <span className="text-xs font-black text-slate-800">{settings?.restaurantName || 'رستوران'}</span>
                  <div className="px-3 py-0.5 rounded-full bg-slate-900 text-white text-xs font-black my-1">
                    {tbl.title}
                  </div>

                  <div className="p-1.5 bg-white rounded-xl border border-slate-200 my-1">
                    {batchQrCodes[tbl.number] ? (
                      <img src={batchQrCodes[tbl.number]} alt={tbl.title} className="w-32 h-32 object-contain" />
                    ) : (
                      <div className="w-32 h-32 flex items-center justify-center bg-slate-50 text-[10px] text-slate-400">
                        بارکد...
                      </div>
                    )}
                  </div>

                  <span className="text-[10px] font-bold text-slate-700 leading-tight">
                    اسکن با دوربین گوشی جهت مشاهده منو
                  </span>

                  {settings?.wifiSsid && (
                    <span className="text-[9px] font-mono text-slate-500 mt-1">
                      Wi-Fi: {settings.wifiSsid}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mobile App QR Modal */}
      <MobileAppQrModal
        isOpen={isMobileAppQrOpen}
        onClose={() => setIsMobileAppQrOpen(false)}
      />

    </div>
  );
}

// Inline QR Code helper
function QrCodeDisplay({ url, size }: { url: string; size: number }) {
  const [dataUrl, setDataUrl] = useState('');

  useEffect(() => {
    QRCode.toDataURL(url, {
      width: size,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' }
    }).then(setDataUrl).catch(() => {});
  }, [url, size]);

  if (!dataUrl) {
    return <div style={{ width: size, height: size }} className="flex items-center justify-center bg-slate-100 text-xs text-slate-400">...</div>;
  }

  return <img src={dataUrl} alt="QR Code" style={{ width: size, height: size }} className="object-contain" />;
}
