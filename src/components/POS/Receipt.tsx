import React, { useEffect, useState } from 'react';
import { formatCurrency, numberToPersianWords } from '../../lib/utils';
import { Order, AppSettings, ReceiptDesignConfig, getEffectiveReceiptConfig } from '../../lib/db';
import { format as formatJalali } from 'date-fns-jalali';
import QRCode from 'qrcode';

interface ReceiptProps {
  order: Order;
  settings: AppSettings;
  overrideConfig?: ReceiptDesignConfig;
}

export const Receipt = React.forwardRef<HTMLDivElement, ReceiptProps>(({ order, settings, overrideConfig }, ref) => {
  const cfg: ReceiptDesignConfig = overrideConfig || getEffectiveReceiptConfig(settings);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');

  // Determine QR Code content
  useEffect(() => {
    if (!cfg.showQrCode) {
      setQrCodeDataUrl('');
      return;
    }

    let payload = '';
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

    switch (cfg.qrCodeType) {
      case 'menu':
        payload = cfg.website ? `${cfg.website.startsWith('http') ? cfg.website : 'https://' + cfg.website}/menu` : `${origin}/?mode=menu`;
        break;
      case 'website':
        payload = cfg.website ? (cfg.website.startsWith('http') ? cfg.website : 'https://' + cfg.website) : origin;
        break;
      case 'instagram':
        if (cfg.instagram) {
          const handle = cfg.instagram.replace('@', '').trim();
          payload = `https://instagram.com/${handle}`;
        } else {
          payload = origin;
        }
        break;
      case 'wifi':
        if (cfg.wifiSsid) {
          payload = `WIFI:T:WPA;S:${cfg.wifiSsid};P:${cfg.wifiPassword || ''};;`;
        } else {
          payload = origin;
        }
        break;
      case 'custom':
        payload = cfg.qrCodeCustomUrl?.trim() || origin;
        break;
      default:
        payload = origin;
    }

    if (payload) {
      QRCode.toDataURL(payload, {
        width: 140,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      }).then(url => {
        setQrCodeDataUrl(url);
      }).catch(err => {
        console.error('Error generating receipt QR code', err);
      });
    }
  }, [
    cfg.showQrCode, 
    cfg.qrCodeType, 
    cfg.website, 
    cfg.instagram, 
    cfg.wifiSsid, 
    cfg.wifiPassword, 
    cfg.qrCodeCustomUrl
  ]);

  // Dimensions & font classes
  const is58mm = cfg.paperWidth === '58mm';
  const maxWidth = is58mm ? '52mm' : '72mm';

  const fontSizes = {
    sm: { base: '9.5px', title: '13px', subtitle: '9px', meta: '8.5px', table: '9px', total: '11px', footer: '8px' },
    md: { base: '11px', title: '15px', subtitle: '10px', meta: '9.5px', table: '10.5px', total: '12.5px', footer: '9px' },
    lg: { base: '12.5px', title: '17px', subtitle: '11px', meta: '10.5px', table: '11.5px', total: '14px', footer: '10px' }
  }[cfg.fontSize || 'md'];

  const dividerClass = {
    dashed: 'border-b border-dashed border-black',
    dotted: 'border-b border-dotted border-black',
    solid: 'border-b border-solid border-black',
    double: 'border-b-2 border-double border-black',
  }[cfg.dividerStyle || 'dashed'];

  const fontFamClass = cfg.fontFamily === 'mono' ? 'font-mono' : 'font-sans';
  const spacingClass = cfg.compactSpacing ? 'py-1 my-1' : 'py-2 my-2';

  // Logo size
  const logoDimensions = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16'
  }[cfg.logoSize || 'md'];

  const restaurantDisplayName = cfg.restaurantName || settings?.restaurantName || 'فروشگاه / رستوران';

  // Format order date
  let formattedDate = '';
  let formattedTime = '';
  try {
    const d = new Date(order.createdAt || Date.now());
    formattedDate = formatJalali(d, 'yyyy/MM/dd');
    formattedTime = formatJalali(d, 'HH:mm');
  } catch {
    formattedDate = '';
    formattedTime = '';
  }

  // Payment method label
  const paymentMethodLabel = {
    card: 'دستگاه کارتخوان (پوز)',
    cash: 'پرداخت نقدی',
    cheque: 'چک / اعتباری',
  }[order.paymentMethod || 'card'] || 'کارتخوان';

  return (
    <div
      ref={ref}
      className={`receipt-print-wrapper w-full mx-auto bg-white text-black ${fontFamClass} box-border select-none`}
      dir="rtl"
      style={{
        maxWidth,
        fontSize: fontSizes.base,
        lineHeight: cfg.compactSpacing ? '1.25' : '1.38',
        padding: is58mm ? '1.5mm 1mm' : '2mm 1.5mm'
      }}
    >
      {/* 1. Header & Logo */}
      <div className={`text-center ${spacingClass} ${dividerClass} pb-2`}>
        {cfg.showLogo && (cfg.logoUrl || settings?.logoUrl) && (
          <img
            src={cfg.logoUrl || settings?.logoUrl}
            alt="Logo"
            className={`${logoDimensions} mx-auto mb-1 object-contain ${cfg.logoGrayscale ? 'grayscale contrast-125' : ''}`}
          />
        )}

        <h1
          style={{ fontSize: fontSizes.title }}
          className="font-black tracking-tight mb-0.5 leading-snug"
        >
          {restaurantDisplayName}
        </h1>

        {cfg.subTitle && (
          <p style={{ fontSize: fontSizes.subtitle }} className="text-gray-800 font-medium">
            {cfg.subTitle}
          </p>
        )}

        {cfg.branchName && (
          <p style={{ fontSize: fontSizes.subtitle }} className="text-gray-600 font-normal">
            {cfg.branchName}
          </p>
        )}

        {cfg.showPhone && (cfg.phone || settings?.phone) && (
          <p style={{ fontSize: fontSizes.meta }} className="text-gray-800 mt-0.5">
            تلفن: <span dir="ltr" className="font-bold">{cfg.phone || settings?.phone}</span>
            {cfg.secondaryPhone && (
              <span className="mr-2"> - <span dir="ltr" className="font-bold">{cfg.secondaryPhone}</span></span>
            )}
          </p>
        )}

        {cfg.showAddress && (cfg.address || settings?.address) && (
          <p
            style={{ fontSize: fontSizes.meta }}
            className="text-gray-800 mt-0.5 whitespace-pre-wrap leading-tight"
          >
            {cfg.address || settings?.address}
          </p>
        )}

        {cfg.showEconomicCode && cfg.economicCode && (
          <p style={{ fontSize: fontSizes.meta }} className="text-gray-700 mt-0.5">
            کد اقتصادی: <span dir="ltr" className="font-mono">{cfg.economicCode}</span>
          </p>
        )}
      </div>

      {/* 2. Receipt Meta (Invoice #, Date, Table, Customer) */}
      <div className={`${spacingClass} ${dividerClass} pb-2 space-y-1`} style={{ fontSize: fontSizes.meta }}>
        <div className="flex justify-between items-center font-bold">
          <span className="text-[120%] tracking-tight">
            {cfg.receiptTitle || 'صورتحساب فروش'}
          </span>
          {cfg.showInvoiceNumber && (
            <span className="font-mono text-[115%]">
              {cfg.invoicePrefix ? `${cfg.invoicePrefix} ` : '#'}{order.invoiceNumber}
            </span>
          )}
        </div>

        {(cfg.showDate || cfg.showTime) && (
          <div className="flex justify-between items-center text-gray-700">
            {cfg.showDate && <span>تاریخ: {formattedDate}</span>}
            {cfg.showTime && <span dir="ltr" className="font-mono">ساعت: {formattedTime}</span>}
          </div>
        )}

        {/* Table & Waiter Badge */}
        {cfg.showTable && order.tableTitle && (
          <div className="bg-black text-white text-center py-1 px-2 rounded font-black my-1" style={{ fontSize: fontSizes.table }}>
            شماره میز: {order.tableTitle} {cfg.showWaiter && order.waiterName ? `(سفارش‌گیر: ${order.waiterName})` : ''}
          </div>
        )}

        {/* Order Type & Cashier info if not dine-in or table */}
        {(cfg.showOrderType || cfg.showCashier) && (!order.tableTitle || !cfg.showTable) && (
          <div className="flex justify-between items-center text-gray-700 text-[95%]">
            {cfg.showOrderType && (
              <span>نوع سفارش: {order.orderType === 'takeaway' ? 'بیرون‌بر' : order.orderType === 'delivery' ? 'ارسال پیک' : 'حضوری'}</span>
            )}
            {cfg.showCashier && order.waiterName && (
              <span>صندوق‌دار: {order.waiterName}</span>
            )}
          </div>
        )}

        {/* Customer Information Box */}
        {cfg.showCustomerInfo && (order.customerPhone || order.customerName) && (
          <div className="bg-gray-100 border border-gray-300 p-1.5 rounded space-y-0.5 mt-1 text-[95%]">
            {cfg.showCustomerName && order.customerName && (
              <p><strong>مشتری:</strong> {order.customerName}</p>
            )}
            {cfg.showCustomerPhone && order.customerPhone && (
              <p><strong>تلفن:</strong> <span dir="ltr" className="font-mono font-bold">{order.customerPhone}</span></p>
            )}
            {cfg.showCustomerCode && order.customerSubscriptionCode && (
              <p><strong>کد اشتراک:</strong> {order.customerSubscriptionCode}</p>
            )}
            {cfg.showCustomerAddress && order.customerAddress && (
              <p className="mt-0.5 leading-tight whitespace-normal border-t border-gray-300 pt-0.5">
                <strong>آدرس تحویل:</strong> {order.customerAddress}
              </p>
            )}
          </div>
        )}
      </div>

      {/* 3. Items Table */}
      <div className={`${spacingClass} ${dividerClass} pb-2`}>
        <table className="w-full table-fixed border-collapse" style={{ fontSize: fontSizes.table }}>
          <thead>
            <tr className="border-b border-black">
              {cfg.showItemRowNumber && (
                <th className="text-right py-1 w-[12%] font-bold pr-0.5">#</th>
              )}
              <th className={`text-right py-1 font-bold ${cfg.showUnitPrice ? 'w-[42%]' : 'w-[58%]'} pr-0.5`}>شرح کالا</th>
              {cfg.showQuantity && (
                <th className="text-center py-1 w-[18%] font-bold">تعداد</th>
              )}
              {cfg.showUnitPrice && (
                <th className="text-center py-1 w-[20%] font-bold">فی</th>
              )}
              {cfg.showItemTotal && (
                <th className="text-left py-1 w-[26%] font-bold pl-0.5">مبلغ</th>
              )}
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, index) => {
              const itemTotal = item.price * item.quantity;
              return (
                <tr key={index} className="border-b border-gray-200 border-dashed">
                  {cfg.showItemRowNumber && (
                    <td className="py-1 pr-0.5 align-top text-gray-500 font-mono text-[90%]">
                      {index + 1}
                    </td>
                  )}
                  <td className="py-1 pr-0.5 text-right align-top break-words whitespace-normal">
                    <div className="font-bold leading-tight">{item.name}</div>
                    {cfg.showItemNotes && item.notes && (
                      <div className="text-[85%] text-gray-600 italic">({item.notes})</div>
                    )}
                  </td>
                  {cfg.showQuantity && (
                    <td className="py-1 text-center align-top font-bold">
                      {item.quantity}
                    </td>
                  )}
                  {cfg.showUnitPrice && (
                    <td className="py-1 text-center align-top text-gray-700 font-mono text-[90%]">
                      {new Intl.NumberFormat('fa-IR').format(item.price)}
                    </td>
                  )}
                  {cfg.showItemTotal && (
                    <td className="py-1 pl-0.5 text-left align-top font-bold font-mono whitespace-nowrap">
                      {new Intl.NumberFormat('fa-IR').format(itemTotal)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 4. Totals & Financials */}
      <div className={`${spacingClass} space-y-1 px-0.5`} style={{ fontSize: fontSizes.base }}>
        {cfg.showSubtotal && (
          <div className="flex justify-between items-center text-gray-800">
            <span>جمع اقلام:</span>
            <span className="font-semibold">{formatCurrency(order.subtotal || 0)}</span>
          </div>
        )}

        {cfg.showDiscount && (order.discountValue || 0) > 0 && (
          <div className="flex justify-between items-center text-gray-800">
            <span>تخفیف {order.discountType === 'percent' ? `(${order.discountValue}%)` : ''}:</span>
            <span className="font-semibold">
              - {order.discountType === 'percent' 
                  ? formatCurrency(((order.subtotal || 0) * (order.discountValue || 0)) / 100) 
                  : formatCurrency(order.discountValue || 0)}
            </span>
          </div>
        )}

        {cfg.showTax && (order.taxAmount || 0) > 0 && (
          <div className="flex justify-between items-center text-gray-800">
            <span>مالیات بر ارزش افزوده ({order.taxPercentage}%):</span>
            <span className="font-semibold">{formatCurrency(order.taxAmount || 0)}</span>
          </div>
        )}

        {cfg.showServiceFee && (order.serviceFee || 0) > 0 && (
          <div className="flex justify-between items-center text-gray-800">
            <span>حق سرویس:</span>
            <span className="font-semibold">{formatCurrency(order.serviceFee || 0)}</span>
          </div>
        )}

        {cfg.showDeliveryFee && (order.deliveryFee || 0) > 0 && (
          <div className="flex justify-between items-center text-gray-800">
            <span>هزینه پیک:</span>
            <span className="font-semibold">{formatCurrency(order.deliveryFee || 0)}</span>
          </div>
        )}

        {/* Final Payable Amount Box */}
        {cfg.highlightTotal === 'inverse' ? (
          <div className="bg-black text-white p-2 rounded flex justify-between items-center font-black mt-1.5" style={{ fontSize: fontSizes.total }}>
            <span>مبلغ قابل پرداخت:</span>
            <span>{formatCurrency(order.total)}</span>
          </div>
        ) : cfg.highlightTotal === 'double' ? (
          <div className="border-t-2 border-b-2 border-double border-black py-1.5 px-1 flex justify-between items-center font-black mt-1.5" style={{ fontSize: fontSizes.total }}>
            <span>مبلغ قابل پرداخت:</span>
            <span>{formatCurrency(order.total)}</span>
          </div>
        ) : cfg.highlightTotal === 'box' ? (
          <div className="border-2 border-black p-1.5 rounded flex justify-between items-center font-black mt-1.5" style={{ fontSize: fontSizes.total }}>
            <span>مبلغ قابل پرداخت:</span>
            <span>{formatCurrency(order.total)}</span>
          </div>
        ) : (
          <div className="border-t border-black pt-1.5 flex justify-between items-center font-black mt-1.5" style={{ fontSize: fontSizes.total }}>
            <span>مبلغ قابل پرداخت:</span>
            <span>{formatCurrency(order.total)}</span>
          </div>
        )}

        {/* Total in Words */}
        {cfg.showTotalInWords && (
          <div className="text-[85%] text-gray-700 text-center font-medium pt-0.5 leading-snug">
            ({numberToPersianWords(order.total)})
          </div>
        )}

        {/* Payment Method */}
        {cfg.showPaymentMethod && (
          <div className="flex justify-between items-center text-gray-600 text-[85%] border-t border-dotted border-gray-300 pt-1 mt-1">
            <span>شیوه پرداخت:</span>
            <span className="font-semibold text-black">{paymentMethodLabel}</span>
          </div>
        )}
      </div>

      {/* 5. Online Presence & Social Handles */}
      {(cfg.showWebsite || cfg.showInstagram || cfg.showTelegram || cfg.showBale || cfg.showEitaa || cfg.showWhatsapp) && (
        <div className={`text-center ${spacingClass} ${dividerClass} pb-2 space-y-0.5 text-[85%]`} dir="ltr">
          {cfg.showWebsite && (cfg.website || settings?.website) && (
            <p className="font-mono font-medium text-black">
              🌐 {cfg.website || settings?.website}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 font-mono text-[90%]">
            {cfg.showInstagram && (cfg.instagram || settings?.instagram) && (
              <span>IG: @{(cfg.instagram || settings?.instagram)?.replace('@', '')}</span>
            )}
            {cfg.showTelegram && (cfg.telegram || settings?.telegram) && (
              <span>TG: @{(cfg.telegram || settings?.telegram)?.replace('@', '')}</span>
            )}
            {cfg.showBale && cfg.bale && (
              <span>Bale: @{cfg.bale.replace('@', '')}</span>
            )}
            {cfg.showEitaa && cfg.eitaa && (
              <span>Eitaa: @{cfg.eitaa.replace('@', '')}</span>
            )}
            {cfg.showWhatsapp && cfg.whatsapp && (
              <span>WA: {cfg.whatsapp}</span>
            )}
          </div>
        </div>
      )}

      {/* 6. QR Code Section */}
      {cfg.showQrCode && qrCodeDataUrl && (
        <div className={`text-center ${spacingClass} ${dividerClass} pb-2`}>
          <img
            src={qrCodeDataUrl}
            alt="QR Code"
            className="w-20 h-20 mx-auto object-contain"
          />
          {cfg.qrCodeCaption && (
            <p className="text-[85%] text-gray-700 font-medium mt-0.5">
              {cfg.qrCodeCaption}
            </p>
          )}
        </div>
      )}

      {/* 7. Guest Wi-Fi Box */}
      {cfg.showWifiBox && cfg.wifiSsid && (
        <div className={`border border-black rounded p-1.5 text-center ${spacingClass} text-[85%]`}>
          <p className="font-bold">اینترنت وای‌فای مهمان (Free Wi-Fi):</p>
          <div className="font-mono text-[90%] mt-0.5" dir="ltr">
            <span>SSID: <strong>{cfg.wifiSsid}</strong></span>
            {cfg.wifiPassword && (
              <span className="ml-2">| Pass: <strong>{cfg.wifiPassword}</strong></span>
            )}
          </div>
        </div>
      )}

      {/* 8. Footer & Thank You Notes */}
      <div className={`text-center ${spacingClass} space-y-1`} style={{ fontSize: fontSizes.footer }}>
        {cfg.thankYouMessage && (
          <p className="font-bold text-[115%] leading-snug">
            {cfg.thankYouMessage}
          </p>
        )}

        {cfg.footerNotes && (
          <p className="text-gray-700 leading-tight whitespace-pre-wrap">
            {cfg.footerNotes}
          </p>
        )}
      </div>

      {/* 9. Tear / Cut Line */}
      {cfg.showCutLine && (
        <div className="text-center text-[75%] text-gray-500 mt-2 pt-1 border-t border-dashed border-gray-400 select-none">
          ✂ - - - - - - - - - خط برش فیش - - - - - - - - - ✂
        </div>
      )}
    </div>
  );
});

Receipt.displayName = 'Receipt';
