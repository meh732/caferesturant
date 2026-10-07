import React, { useState, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Send, Mic, Square, Paperclip, Image as ImageIcon, FileText, 
  BarChart3, RefreshCw, Trash2, Download, Play, Pause, 
  Users, MessageSquare, Bot, AlertCircle, Check, Sparkles, 
  TrendingUp, ShoppingBag, ShieldCheck, CornerDownLeft, Volume2
} from 'lucide-react';
import { db, ChatMessage, ChatAttachment, UserRole } from '../../lib/db';
import { sendChatMessage } from '../../lib/chatNotificationService';
import { useAuth } from '../../context/AuthContext';
import { format as formatJalali } from 'date-fns-jalali';
import { formatCurrency } from '../../lib/utils';

const CHANNELS = [
  { id: 'general', name: 'عمومی و پرسنل', icon: Users, color: 'text-blue-600 bg-blue-50' },
  { id: 'kitchen', name: 'آشپزخانه و بار', icon: Sparkles, color: 'text-amber-600 bg-amber-50' },
  { id: 'waiters', name: 'گارسون‌ها و سالن', icon: ShoppingBag, color: 'text-emerald-600 bg-emerald-50' },
  { id: 'management', name: 'مدیریت و مالی', icon: ShieldCheck, color: 'text-purple-600 bg-purple-50' },
];

export default function ChatScreen() {
  const { currentUser } = useAuth();
  const [selectedChannel, setSelectedChannel] = useState<string>('general');
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [showReportPicker, setShowReportPicker] = useState(false);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  // Audio playback state
  const [playingAudioId, setPlayingAudioId] = useState<number | null>(null);
  const audioElementsRef = useRef<{ [key: number]: HTMLAudioElement }>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Live queries
  const messages = useLiveQuery(async () => {
    return db.chatMessages
      .where('channelId')
      .equals(selectedChannel)
      .sortBy('createdAt');
  }, [selectedChannel]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle Voice Recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          // Send voice message
          await sendChatMessage({
            channelId: selectedChannel,
            senderName: currentUser?.name || currentUser?.username || 'پرسنل',
            senderId: currentUser?.id,
            senderRole: currentUser?.role,
            content: 'پیام صوتی (ویس)',
            voiceNote: {
              dataUrl: base64Audio,
              durationSeconds: recordingSeconds
            }
          });
        };
        reader.readAsDataURL(audioBlob);
        // Stop all audio tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone access denied:', err);
      alert('دسترسی به میکروفون امکان‌پذیر نیست یا مسدود شده است.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      setRecordingSeconds(0);
    }
  };

  // Play / Pause Audio
  const togglePlayAudio = (id: number, dataUrl: string) => {
    if (playingAudioId === id) {
      audioElementsRef.current[id]?.pause();
      setPlayingAudioId(null);
    } else {
      if (playingAudioId && audioElementsRef.current[playingAudioId]) {
        audioElementsRef.current[playingAudioId].pause();
      }
      let audio = audioElementsRef.current[id];
      if (!audio) {
        audio = new Audio(dataUrl);
        audioElementsRef.current[id] = audio;
        audio.onended = () => setPlayingAudioId(null);
      }
      audio.play();
      setPlayingAudioId(id);
    }
  };

  // Handle File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      const isImg = file.type.startsWith('image/');
      reader.onloadend = () => {
        setPendingAttachments(prev => [
          ...prev,
          {
            id: 'att-' + Date.now() + Math.random(),
            name: file.name,
            type: isImg ? 'image' : 'file',
            mimeType: file.type,
            size: file.size,
            dataUrl: reader.result as string
          }
        ]);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Send Direct Report to Chat
  const handleSendReport = async (reportType: 'sales_summary' | 'daily_z' | 'low_stock' | 'cash_drawer') => {
    setShowReportPicker(false);
    setIsSending(true);

    try {
      let title = '';
      let metrics: { label: string; value: string; color?: string }[] = [];
      let summaryText = '';

      if (reportType === 'sales_summary' || reportType === 'daily_z') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const orders = await db.orders.where('createdAt').aboveOrEqual(today).toArray();
        const paidOrders = orders.filter(o => o.status === 'paid');
        const totalSales = paidOrders.reduce((sum, o) => sum + (o.total || 0), 0);
        const totalItemsCount = paidOrders.reduce((sum, o) => sum + o.items.reduce((acc, i) => acc + i.quantity, 0), 0);

        title = reportType === 'daily_z' ? 'گزارش بستن صندوق روزانه (Z-Report)' : 'خلاصه فروش زنده امروز';
        metrics = [
          { label: 'کل فروش امروز', value: `${formatCurrency(totalSales)} تومان`, color: 'text-emerald-700' },
          { label: 'تعداد فاکتورها', value: `${paidOrders.length} عدد` },
          { label: 'تعداد اقلام فروخته شده', value: `${totalItemsCount} پرس/عدد`, color: 'text-blue-700' },
        ];
        summaryText = `استخراج شده توسط ${currentUser?.name || 'مدیر سیستم'} در تاریخ ${formatJalali(new Date(), 'yyyy/MM/dd HH:mm')}`;
      } else if (reportType === 'low_stock') {
        const materials = await db.rawMaterials.toArray();
        const stocks = await db.warehouseStocks.toArray();
        const lowItems = materials.filter(m => {
          const qty = stocks.filter(s => s.materialId === m.id).reduce((acc, s) => acc + s.quantity, 0);
          return qty <= (m.minStockAlert || 10);
        }).map(m => {
          const qty = stocks.filter(s => s.materialId === m.id).reduce((acc, s) => acc + s.quantity, 0);
          return { ...m, currentStock: qty };
        });
        
        title = 'هشدار مواد اولیه رو به اتمام (کسری موجودی انبار)';
        metrics = [
          { label: 'اقلام نیازمند سفارش', value: `${lowItems.length} قلم کالا`, color: 'text-rose-700' },
        ];
        summaryText = lowItems.slice(0, 5).map(m => `• ${m.name}: موجودی ${m.currentStock} ${m.unit} (حداقل: ${m.minStockAlert})`).join('\n') || 'تمامی اقلام موجودی کافی دارند.';
      } else {
        title = 'وضعیت موجودی صندوق فروشگاه';
        metrics = [
          { label: 'زمان استخراج', value: formatJalali(new Date(), 'HH:mm') }
        ];
        summaryText = 'اطلاعات زنده گردش وجوه نقد پایانه فروشگاهی آرکا';
      }

      const reportAttachment: ChatAttachment = {
        id: 'rep-' + Date.now(),
        name: title,
        type: 'report',
        reportData: {
          reportType,
          title,
          metrics,
          summaryText
        }
      };

      await sendChatMessage({
        channelId: selectedChannel,
        senderName: currentUser?.name || currentUser?.username || 'پرسنل',
        senderId: currentUser?.id,
        senderRole: currentUser?.role,
        content: `گزارش سیستمی: ${title}`,
        attachments: [reportAttachment]
      });
    } catch (e) {
      console.error('Error generating report:', e);
    } finally {
      setIsSending(false);
    }
  };

  // Send Text Message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!inputText.trim() && pendingAttachments.length === 0) || isSending) return;

    setIsSending(true);
    try {
      await sendChatMessage({
        channelId: selectedChannel,
        senderName: currentUser?.name || currentUser?.username || 'پرسنل',
        senderId: currentUser?.id,
        senderRole: currentUser?.role,
        content: inputText.trim(),
        attachments: pendingAttachments.length > 0 ? pendingAttachments : undefined
      });

      setInputText('');
      setPendingAttachments([]);
    } catch (err) {
      console.error('Failed to send chat message:', err);
    } finally {
      setIsSending(false);
    }
  };

  const currentChannelInfo = CHANNELS.find(c => c.id === selectedChannel) || CHANNELS[0];

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full bg-slate-100 overflow-hidden" dir="rtl">
      
      {/* Channels Sidebar */}
      <aside className="w-full md:w-64 bg-white border-l border-slate-200 flex flex-col shrink-0 shadow-2xs">
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <MessageSquare size={20} />
            </div>
            <div>
              <h2 className="font-black text-sm text-slate-800">گفتگوی داخلی پرسنل</h2>
              <span className="text-[11px] text-slate-400">شبکه ارتباطی زنده آرکا</span>
            </div>
          </div>
        </div>

        {/* Channel List */}
        <div className="p-2 space-y-1 overflow-y-auto flex-1">
          {CHANNELS.map(ch => {
            const Icon = ch.icon;
            const isSelected = ch.id === selectedChannel;
            return (
              <button
                key={ch.id}
                onClick={() => setSelectedChannel(ch.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl text-right transition-all cursor-pointer ${
                  isSelected 
                    ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-500/20' 
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? 'bg-white/20 text-white' : ch.color}`}>
                  <Icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs truncate block">{ch.name}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Quick User Info in Chat */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
            {(currentUser?.name || currentUser?.username || 'ک').charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-bold text-slate-800 truncate block">
              {currentUser?.name || currentUser?.username}
            </span>
            <span className="text-[10px] text-emerald-600 font-medium">آنلاین در شبکه</span>
          </div>
        </div>
      </aside>

      {/* Main Chat Conversation View */}
      <div className="flex-1 flex flex-col h-full bg-slate-50/70 overflow-hidden">
        
        {/* Chat Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between shrink-0 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${currentChannelInfo.color}`}>
              <currentChannelInfo.icon size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">{currentChannelInfo.name}</h2>
              <span className="text-[10px] text-slate-400">پیام‌ها، ویس‌ها و گزارشات ارسالی به‌صورت آنی همگام می‌شوند</span>
            </div>
          </div>

          {/* Quick Action: Send Live Report Button */}
          <div className="relative">
            <button
              onClick={() => setShowReportPicker(!showReportPicker)}
              className="px-3.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center gap-1.5 border border-indigo-200/80 transition-all cursor-pointer shadow-2xs"
            >
              <BarChart3 size={15} />
              <span>ارسال گزارش زنده</span>
            </button>

            {/* Report Picker Dropdown */}
            {showReportPicker && (
              <div className="absolute left-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 z-30 space-y-1 animate-in fade-in zoom-in-95">
                <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400">
                  انتخاب نوع گزارش جهت ارسال مستقیم:
                </div>
                <button
                  onClick={() => handleSendReport('sales_summary')}
                  className="w-full text-right p-2.5 rounded-xl hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-2 cursor-pointer"
                >
                  <TrendingUp size={16} className="text-emerald-600" />
                  <span>خلاصه فروش امروز</span>
                </button>
                <button
                  onClick={() => handleSendReport('daily_z')}
                  className="w-full text-right p-2.5 rounded-xl hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-2 cursor-pointer"
                >
                  <BarChart3 size={16} className="text-blue-600" />
                  <span>گزارش بستن صندوق روزانه (Z)</span>
                </button>
                <button
                  onClick={() => handleSendReport('low_stock')}
                  className="w-full text-right p-2.5 rounded-xl hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-2 cursor-pointer"
                >
                  <AlertCircle size={16} className="text-rose-600" />
                  <span>کسری مواد اولیه و انبار</span>
                </button>
                <button
                  onClick={() => handleSendReport('cash_drawer')}
                  className="w-full text-right p-2.5 rounded-xl hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-2 cursor-pointer"
                >
                  <ShoppingBag size={16} className="text-purple-600" />
                  <span>وضعیت موجودی دخل صندوق</span>
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {messages && messages.length > 0 ? (
            messages.map(msg => {
              const isMine = msg.senderName === (currentUser?.name || currentUser?.username);
              const timeStr = msg.createdAt ? formatJalali(new Date(msg.createdAt), 'HH:mm') : '';

              return (
                <div 
                  key={msg.id} 
                  className={`flex flex-col ${isMine ? 'items-start' : 'items-end'} max-w-full`}
                >
                  {/* Sender Header */}
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <span className="text-[11px] font-bold text-slate-700">{msg.senderName}</span>
                    {msg.senderRole && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-slate-200/80 text-slate-600">
                        {msg.senderRole === 'admin' ? 'مدیر' : msg.senderRole === 'waiter' ? 'گارسون' : 'پرسنل'}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400 font-mono mr-1">{timeStr}</span>
                  </div>

                  {/* Message Bubble */}
                  <div className={`p-4 rounded-2xl max-w-lg shadow-2xs space-y-2.5 ${
                    isMine 
                      ? 'bg-blue-600 text-white rounded-tr-xs' 
                      : msg.isSystemEvent
                        ? 'bg-slate-800 text-slate-100 rounded-tl-xs'
                        : 'bg-white border border-slate-200 text-slate-800 rounded-tl-xs'
                  }`}>
                    
                    {/* Text content */}
                    {msg.content && (
                      <p className="text-xs leading-relaxed whitespace-pre-wrap select-text">
                        {msg.content}
                      </p>
                    )}

                    {/* Voice Note Player */}
                    {msg.voiceNote && (
                      <div className={`flex items-center gap-3 p-2 rounded-xl ${isMine ? 'bg-white/15' : 'bg-slate-100'}`}>
                        <button
                          onClick={() => msg.id && msg.voiceNote && togglePlayAudio(msg.id, msg.voiceNote.dataUrl)}
                          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 cursor-pointer shadow-xs ${
                            isMine ? 'bg-white text-blue-600' : 'bg-blue-600 text-white'
                          }`}
                        >
                          {playingAudioId === msg.id ? <Pause size={16} /> : <Play size={16} className="mr-0.5" />}
                        </button>
                        <div className="flex-1">
                          <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                            <span className="flex items-center gap-1">
                              <Volume2 size={12} />
                              <span>ویس صوتی</span>
                            </span>
                            <span>{msg.voiceNote.durationSeconds}s</span>
                          </div>
                          <div className={`h-1.5 rounded-full overflow-hidden ${isMine ? 'bg-white/30' : 'bg-slate-200'}`}>
                            <div className={`h-full ${isMine ? 'bg-white' : 'bg-blue-600'} ${playingAudioId === msg.id ? 'animate-pulse w-full' : 'w-1/2'}`}></div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Attachments (Images, Files, Reports) */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="space-y-2 pt-1">
                        {msg.attachments.map(att => {
                          if (att.type === 'image' && att.dataUrl) {
                            return (
                              <div key={att.id} className="rounded-xl overflow-hidden border border-black/10">
                                <img src={att.dataUrl} alt={att.name} className="max-h-60 w-auto rounded-lg object-contain" />
                                <span className="text-[10px] block mt-1 opacity-80">{att.name}</span>
                              </div>
                            );
                          }

                          if (att.type === 'report' && att.reportData) {
                            return (
                              <div key={att.id} className="bg-white/95 text-slate-800 rounded-xl p-3.5 border border-indigo-200 shadow-xs space-y-2" dir="rtl">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                  <div className="flex items-center gap-1.5 text-xs font-black text-indigo-900">
                                    <BarChart3 size={15} className="text-indigo-600" />
                                    <span>{att.reportData.title}</span>
                                  </div>
                                  <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md font-bold">
                                    سیستمی
                                  </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  {att.reportData.metrics.map((m, idx) => (
                                    <div key={idx} className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                                      <span className="text-[10px] text-slate-500 block">{m.label}</span>
                                      <span className={`font-bold mt-0.5 block ${m.color || 'text-slate-800'}`}>{m.value}</span>
                                    </div>
                                  ))}
                                </div>

                                {att.reportData.summaryText && (
                                  <p className="text-[11px] text-slate-600 leading-normal bg-slate-50/50 p-2 rounded-lg whitespace-pre-line border border-slate-100/50">
                                    {att.reportData.summaryText}
                                  </p>
                                )}
                              </div>
                            );
                          }

                          // Regular file download
                          return (
                            <div key={att.id} className={`flex items-center justify-between p-2.5 rounded-xl ${isMine ? 'bg-white/15' : 'bg-slate-100'}`}>
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText size={18} />
                                <span className="text-xs truncate">{att.name}</span>
                              </div>
                              {att.dataUrl && (
                                <a
                                  href={att.dataUrl}
                                  download={att.name}
                                  className={`p-1.5 rounded-lg cursor-pointer ${isMine ? 'hover:bg-white/20' : 'hover:bg-slate-200'}`}
                                  title="دانلود فایل"
                                >
                                  <Download size={14} />
                                </a>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                  </div>
                </div>
              );
            })
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-center text-slate-400">
              <MessageSquare size={32} className="mb-2 opacity-30" />
              <p className="text-xs font-medium">هیچ پیامی در این بخش وجود ندارد.</p>
              <span className="text-[11px] mt-1 text-slate-400">شروع به ارسال پیام، فایل یا ویس صوتی کنید.</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Pending Attachments Strip */}
        {pendingAttachments.length > 0 && (
          <div className="bg-white border-t border-slate-200 px-4 py-2 flex items-center gap-2 overflow-x-auto shrink-0">
            <span className="text-xs font-bold text-slate-500 shrink-0">پیوست‌ها:</span>
            {pendingAttachments.map(att => (
              <div key={att.id} className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-800 px-2.5 py-1 rounded-lg text-xs shrink-0">
                <Paperclip size={12} />
                <span className="truncate max-w-[120px]">{att.name}</span>
                <button
                  onClick={() => setPendingAttachments(prev => prev.filter(p => p.id !== att.id))}
                  className="text-rose-500 hover:text-rose-700 ml-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input Bar */}
        <footer className="bg-white border-t border-slate-200 p-3 sm:p-4 shrink-0">
          {isRecording ? (
            /* Voice recording interface */
            <div className="flex items-center justify-between bg-rose-50 border border-rose-200 p-3 rounded-2xl animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full bg-rose-600 animate-ping"></div>
                <span className="text-xs font-bold text-rose-800">در حال ضبط صدا... ({recordingSeconds} ثانیه)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cancelRecording}
                  className="px-3 py-1.5 rounded-xl bg-white border border-rose-300 text-rose-700 text-xs font-bold cursor-pointer"
                >
                  لغو
                </button>
                <button
                  type="button"
                  onClick={stopRecording}
                  className="px-4 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold flex items-center gap-1 cursor-pointer shadow-xs"
                >
                  <Send size={13} />
                  <span>ارسال ویس</span>
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              
              {/* Attachment Picker Button */}
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
                multiple 
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2.5 rounded-xl text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer shrink-0"
                title="پیوست فایل یا تصویر"
              >
                <Paperclip size={20} />
              </button>

              {/* Text Input */}
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="پیام خود را بنویسید..."
                className="flex-1 px-4 py-2.5 bg-slate-100 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />

              {/* Voice Record Button */}
              <button
                type="button"
                onClick={startRecording}
                className="p-2.5 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                title="ضبط و ارسال پیام صوتی (ویس)"
              >
                <Mic size={20} />
              </button>

              {/* Send Button */}
              <button
                type="submit"
                disabled={(!inputText.trim() && pendingAttachments.length === 0) || isSending}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-blue-500/20 transition-all cursor-pointer shrink-0"
              >
                {isSending ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
                <span className="hidden sm:inline">ارسال</span>
              </button>
            </form>
          )}
        </footer>

      </div>

    </div>
  );
}
