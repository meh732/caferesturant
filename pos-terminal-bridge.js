import net from 'net';
import os from 'os';

export const IRANIAN_POS_DRIVERS = [
  { id: 'auto', label: 'تشخیص خودکار استاندارد ایران (PC-POS)', defaultPort: 1197, bankHints: [] },
  { id: 'behpardakht', label: 'به‌پرداخت ملت (Behpardakht)', defaultPort: 1197, bankHints: ['ملت'] },
  { id: 'sep_saman', label: 'پرداخت الکترونیک سامان (SEP)', defaultPort: 1362, bankHints: ['سامان'] },
  { id: 'parsian_pec', label: 'تجارت الکترونیک پارسیان (PEC)', defaultPort: 1362, bankHints: ['پارسیان'] },
  { id: 'sadad_melli', label: 'سداد بانک ملی (Sadad)', defaultPort: 1197, bankHints: ['ملی'] },
  { id: 'irankish', label: 'ایران‌کیش (KICCC)', defaultPort: 1362, bankHints: ['تجارت', 'رفاه', 'ایران زمین'] },
  { id: 'pasargad', label: 'پرداخت الکترونیک پاسارگاد (PEP)', defaultPort: 8888, bankHints: ['پاسارگاد'] },
  { id: 'fanava', label: 'فناوا کارت (Fanava)', defaultPort: 8888, bankHints: ['سپه', 'دی', 'شهر'] },
  { id: 'asan_pardakht', label: 'آسان پرداخت (Asan Pardakht)', defaultPort: 8888, bankHints: ['کشاورزی', 'مسکن'] },
  { id: 'novin', label: 'پرداخت نوین آرین', defaultPort: 5000, bankHints: ['اقتصاد نوین'] },
  { id: 'mabna', label: 'مبنا کارت آریا (صادرات)', defaultPort: 9000, bankHints: ['صادرات'] },
  { id: 'http_bridge', label: 'سرویس وب‌سرویس لوکال ویندوز (HTTP Bridge)', defaultPort: 8085, bankHints: [] }
];

const COMMON_POS_SCAN_PORTS = [1197, 1362, 1024, 8888, 9999, 5000, 4000, 8085];

/**
 * Strictly validate private RFC1918 LAN IPv4 addresses and localhost.
 * Blocks public internet destinations and cloud metadata IPs (169.254.0.0/16) to prevent SSRF.
 */
export function isPrivateOrLoopbackHost(rawHost) {
  const host = String(rawHost || '').trim().toLowerCase();
  if (!host) return false;
  if (host === 'localhost') return true;

  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4Match) return false;

  const octets = ipv4Match.slice(1).map((n) => parseInt(n, 10));
  if (octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) return false;

  const [a, b] = octets;
  if (a === 127) return true; // Loopback 127.0.0.0/8
  if (a === 10) return true; // Private 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // Private 172.16.0.0/12
  if (a === 192 && b === 168) return true; // Private 192.168.0.0/16

  return false;
}

export function sanitizeField(val, maxLen = 40) {
  return String(val || '')
    .replace(/[\r\n\0|;<>]/g, '')
    .trim()
    .slice(0, maxLen);
}

export function validatePosConnectionConfig({ mode = 'tcp_direct', ip, port, bridgeUrl }) {
  if (mode === 'http_bridge') {
    const rawUrl = String(bridgeUrl || '').trim();
    if (!rawUrl) {
      throw new Error('آدرس وب‌سرویس محلی کارتخوان (HTTP Bridge URL) وارد نشده است.');
    }
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error('فرمت آدرس سرویس کارتخوان معتبر نیست.');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('فقط پروتکل http یا https مجاز است.');
    }
    if (!isPrivateOrLoopbackHost(parsed.hostname)) {
      throw new Error('به دلایل امنیتی، اتصال فقط به آدرس‌های شبکه داخلی (LAN / localhost) مجاز است.');
    }
    return { mode: 'http_bridge', url: parsed.toString() };
  }

  const cleanIp = String(ip || '').trim();
  if (!isPrivateOrLoopbackHost(cleanIp)) {
    throw new Error('آدرس IP کارتخوان نامعتبر است یا در محدوده شبکه داخلی (192.168.x.x / 10.x.x.x / 172.16-31.x.x / 127.0.0.1) نیست.');
  }
  const parsedPort = parseInt(String(port || '0'), 10);
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    throw new Error('شماره پورت کارتخوان باید عددی بین 1 تا 65535 باشد.');
  }
  return { mode: 'tcp_direct', ip: cleanIp, port: parsedPort };
}

function buildLengthPrefixedPacket(bodyStr) {
  const bodyBuf = Buffer.from(bodyStr, 'utf8');
  const lenHeader = String(bodyBuf.length).padStart(4, '0');
  return Buffer.concat([Buffer.from(lenHeader, 'ascii'), bodyBuf]);
}

function buildPosPayloads(driver, { amountRial, invoiceRef, terminalId, merchantId }) {
  const amt = String(amountRial);
  const ref = sanitizeField(invoiceRef || Date.now(), 24);
  const tid = sanitizeField(terminalId || '', 16);
  const mid = sanitizeField(merchantId || '', 20);

  switch (driver) {
    case 'behpardakht': {
      // Standard Behpardakht Mellat PC-POS LAN tag-value frame
      const kv = `AM=${amt};CU=364;PD=${ref};${tid ? `PC=${tid};` : 'PC=1;'}TR=1;`;
      return [buildLengthPrefixedPacket(kv)];
    }
    case 'sep_saman': {
      // Standard Saman SEP LAN TCP frame
      const kv = `AM=${amt};R1=${ref};${tid ? `TI=${tid};` : ''}TP=0;`;
      return [buildLengthPrefixedPacket(kv)];
    }
    case 'parsian_pec': {
      const kv = `Amount=${amt};OrderId=${ref};${tid ? `TerminalId=${tid};` : ''}TxnType=Sale;`;
      return [buildLengthPrefixedPacket(kv)];
    }
    case 'sadad_melli': {
      const payload = JSON.stringify({
        Amount: amt,
        OrderId: ref,
        TerminalId: tid || undefined,
        MerchantId: mid || undefined,
        TransactionType: 'Purchase'
      });
      return [buildLengthPrefixedPacket(payload)];
    }
    case 'irankish': {
      const kv = `AM=${amt};SN=${ref};${tid ? `TI=${tid};` : ''}TR=000000;`;
      return [buildLengthPrefixedPacket(kv)];
    }
    case 'pasargad':
    case 'fanava':
    case 'asan_pardakht':
    case 'novin':
    case 'mabna': {
      const payload = JSON.stringify({
        Amount: Number(amt),
        InvoiceNumber: ref,
        TerminalId: tid || undefined,
        MerchantId: mid || undefined,
        ServiceCode: 'Sale'
      });
      return [buildLengthPrefixedPacket(payload)];
    }
    case 'auto':
    default: {
      // Widely-compatible 4-byte length-prefixed Iranian PC-POS tag-value sale packet
      const kv = `AM=${amt};CU=364;PD=${ref};${tid ? `TI=${tid};` : ''}TR=000000;`;
      return [buildLengthPrefixedPacket(kv)];
    }
  }
}

export function parsePosTerminalResponse(rawBuffer) {
  const text = Buffer.isBuffer(rawBuffer)
    ? rawBuffer.toString('utf8').replace(/\0/g, '').trim()
    : String(rawBuffer || '').trim();

  if (!text) {
    return { parsed: false, approved: null, trackingCode: '', responseCode: '', cardMask: '', message: '' };
  }

  let trackingCode = '';
  let responseCode = '';
  let cardMask = '';
  let message = '';

  // 1. Try JSON response
  const jsonStart = text.indexOf('{');
  if (jsonStart !== -1) {
    try {
      const obj = JSON.parse(text.slice(jsonStart));
      trackingCode = String(
        obj.RRN || obj.rrn || obj.TraceNo || obj.traceNo || obj.ReferenceNumber ||
        obj.referenceNumber || obj.RefNum || obj.SerialNo || obj.trackingCode || ''
      ).trim();
      responseCode = String(
        obj.RespCode ?? obj.respCode ?? obj.ResponseCode ?? obj.responseCode ??
        obj.ResultCode ?? obj.statusCode ?? ''
      ).trim();
      cardMask = String(obj.CardNumber || obj.CardNo || obj.cardMask || obj.Pan || '').trim();
      message = String(obj.Message || obj.message || obj.RespMsg || obj.Description || '').trim();
    } catch {}
  }

  // 2. Try XML tag extraction
  if (!trackingCode) {
    const rrnXml = text.match(/<(?:RRN|TraceNo|RefNum|ReferenceNumber)>([^<]+)<\/(?:RRN|TraceNo|RefNum|ReferenceNumber)>/i);
    if (rrnXml) trackingCode = rrnXml[1].trim();
  }
  if (!responseCode) {
    const rcXml = text.match(/<(?:ResponseCode|RespCode|ResultCode)>([^<]+)<\/(?:ResponseCode|RespCode|ResultCode)>/i);
    if (rcXml) responseCode = rcXml[1].trim();
  }
  if (!cardMask) {
    const cardXml = text.match(/<(?:CardNo|CardNumber|Pan)>([^<]+)<\/(?:CardNo|CardNumber|Pan)>/i);
    if (cardXml) cardMask = cardXml[1].trim();
  }

  // 3. Try Key=Value (AM=...;RN=...;TR=...;RC=00;CN=6037...)
  if (!trackingCode) {
    const kvTrack = text.match(/(?:RRN|RN|TR|TraceNo|RefNum|ST)\s*[:=]\s*([A-Za-z0-9-]{4,24})/i);
    if (kvTrack) trackingCode = kvTrack[1].trim();
  }
  if (!responseCode) {
    const kvRc = text.match(/(?:RC|RespCode|ResponseCode|RS)\s*[:=]\s*([A-Za-z0-9]{1,4})/i);
    if (kvRc) responseCode = kvRc[1].trim();
  }
  if (!cardMask) {
    const kvCard = text.match(/(?:CN|CardNo|CardNumber|PAN)\s*[:=]\s*([0-9*X-]{12,20})/i);
    if (kvCard) cardMask = kvCard[1].trim();
  }

  const normalizedRc = responseCode.toLowerCase();
  let approved = null;
  if (normalizedRc === '00' || normalizedRc === '0' || normalizedRc === 'ok' || normalizedRc === 'success') {
    approved = true;
  } else if (['98', '55', '51', '12', '33', '61', '65', '91', '96', '-1', 'cancel', 'error', 'failed'].includes(normalizedRc)) {
    approved = false;
  }

  return {
    parsed: Boolean(trackingCode || responseCode || cardMask),
    approved,
    trackingCode,
    responseCode,
    cardMask,
    message,
    rawSnippet: text.slice(0, 180)
  };
}

function tcpProbe(ip, port, timeoutMs = 400) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = new net.Socket();
    let settled = false;

    const finish = (reachable, err = null) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {}
      resolve({ reachable, latencyMs: Date.now() - started, error: err });
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true, null));
    socket.once('timeout', () => finish(false, 'timeout'));
    socket.once('error', (err) => finish(false, err.code || err.message));
    socket.connect(port, ip);
  });
}

function guessDriverForPort(port) {
  if (port === 1197 || port === 1024) return 'behpardakht';
  if (port === 1362) return 'sep_saman';
  if (port === 8888 || port === 9999) return 'pasargad';
  if (port === 5000) return 'novin';
  if (port === 8085) return 'http_bridge';
  return 'auto';
}

export async function testPosTerminalConnection(config) {
  const validated = validatePosConnectionConfig(config);

  if (validated.mode === 'http_bridge') {
    const started = Date.now();
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(validated.url, { method: 'OPTIONS', signal: controller.signal }).catch(() =>
        fetch(validated.url, { method: 'GET', signal: controller.signal })
      );
      clearTimeout(t);
      return {
        ok: true,
        reachable: true,
        latencyMs: Date.now() - started,
        status: res.status,
        message: 'اتصال به سرویس لوکال کارتخوان برقرار شد.'
      };
    } catch (err) {
      return {
        ok: false,
        reachable: false,
        latencyMs: Date.now() - started,
        message: `سرویس وب‌سرویس کارتخوان در آدرس ${validated.url} پاسخ نداد (${err?.message || 'Timeout'}).`
      };
    }
  }

  const probe = await tcpProbe(validated.ip, validated.port, 2500);
  if (probe.reachable) {
    return {
      ok: true,
      reachable: true,
      latencyMs: probe.latencyMs,
      message: `اتصال شبکه با کارتخوان ${validated.ip}:${validated.port} برقرار شد (${probe.latencyMs} میلی‌ثانیه).`
    };
  }

  return {
    ok: false,
    reachable: false,
    latencyMs: probe.latencyMs,
    message: `کارتخوان در آدرس ${validated.ip}:${validated.port} در دسترس نیست (${probe.error === 'ECONNREFUSED' ? 'پورت بسته است یا حالت PC-POS در دستگاه فعال نیست' : 'عدم پاسخ در شبکه LAN'}).`
  };
}

export async function scanLanPosTerminals({ customSubnetBase } = {}) {
  const subnets = new Set();

  if (customSubnetBase && typeof customSubnetBase === 'string') {
    const clean = customSubnetBase.trim();
    if (isPrivateOrLoopbackHost(`${clean}.1`)) {
      subnets.add(clean);
    }
  }

  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    const lower = name.toLowerCase();
    if (lower.includes('loopback') || lower.includes('virtualbox') || lower.includes('vmware')) continue;
    for (const info of nets[name] || []) {
      if (info.family === 'IPv4' && !info.internal && isPrivateOrLoopbackHost(info.address)) {
        const parts = info.address.split('.');
        if (parts.length === 4) {
          subnets.add(`${parts[0]}.${parts[1]}.${parts[2]}`);
        }
      }
    }
  }

  const discovered = [];
  const targets = [];

  for (const base of Array.from(subnets).slice(0, 2)) {
    for (let host = 2; host <= 254; host++) {
      const ip = `${base}.${host}`;
      for (const port of COMMON_POS_SCAN_PORTS) {
        targets.push({ ip, port });
      }
    }
  }

  // Also check localhost bridge port 8085
  targets.push({ ip: '127.0.0.1', port: 8085 });

  // Probe in fast concurrent batches so scan completes in ~2-3 seconds
  const BATCH_SIZE = 120;
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async ({ ip, port }) => {
        const r = await tcpProbe(ip, port, 280);
        return r.reachable ? { ip, port, latencyMs: r.latencyMs, suggestedDriver: guessDriverForPort(port) } : null;
      })
    );
    for (const item of results) {
      if (item) discovered.push(item);
    }
    if (discovered.length >= 12) break;
  }

  return {
    ok: true,
    scannedSubnets: Array.from(subnets),
    discovered
  };
}

export async function sendAmountToPosTerminal({
  mode = 'tcp_direct',
  driver = 'auto',
  ip,
  port,
  bridgeUrl,
  terminalId,
  merchantId,
  amountRial,
  invoiceRef,
  timeoutMs = 35000
}) {
  const numericAmount = Math.round(Number(amountRial));
  if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > 100_000_000_000) {
    throw new Error('مبلغ ارسالی به کارتخوان نامعتبر است.');
  }

  const validated = validatePosConnectionConfig({ mode, ip, port, bridgeUrl });
  const safeRef = sanitizeField(invoiceRef || `ARKA-${Date.now()}`, 24);
  const safeTid = sanitizeField(terminalId || '', 16);
  const safeMid = sanitizeField(merchantId || '', 20);

  if (validated.mode === 'http_bridge') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(validated.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          Amount: numericAmount,
          amount: numericAmount,
          AmountRial: numericAmount,
          PRCode: '000000',
          TerminalId: safeTid || undefined,
          MerchantId: safeMid || undefined,
          ResNum: safeRef,
          InvoiceNumber: safeRef,
          OrderId: safeRef,
          Driver: driver
        })
      });
      clearTimeout(timer);
      const rawText = await response.text();
      const parsed = parsePosTerminalResponse(rawText);
      if (parsed.approved === false) {
        return {
          ok: false,
          status: 'declined',
          amountRial: numericAmount,
          trackingCode: parsed.trackingCode,
          cardMask: parsed.cardMask,
          responseCode: parsed.responseCode,
          message: parsed.message || 'تراکنش توسط کارتخوان لغو یا رد شد.'
        };
      }
      return {
        ok: true,
        status: parsed.approved === true ? 'approved' : 'sent',
        amountRial: numericAmount,
        trackingCode: parsed.trackingCode,
        cardMask: parsed.cardMask,
        responseCode: parsed.responseCode,
        message: parsed.trackingCode
          ? `تراکنش تایید شد (کد پیگیری: ${parsed.trackingCode})`
          : 'مبلغ با موفقیت به سرویس کارتخوان ارسال شد.'
      };
    } catch (err) {
      clearTimeout(timer);
      throw new Error(`خطا در ارسال مبلغ به سرویس کارتخوان: ${err?.message || 'عدم پاسخ'}`);
    }
  }

  // TCP Direct Socket mode
  const payloads = buildPosPayloads(driver, {
    amountRial: numericAmount,
    invoiceRef: safeRef,
    terminalId: safeTid,
    merchantId: safeMid
  });
  const packet = payloads[0];

  return await new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const chunks = [];
    let settled = false;
    let connected = false;
    let totalTimer = null;
    let idleReadTimer = null;

    const cleanup = () => {
      if (totalTimer) clearTimeout(totalTimer);
      if (idleReadTimer) clearTimeout(idleReadTimer);
      try {
        socket.destroy();
      } catch {}
    };

    const done = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const fail = (message) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };

    // Wait up to 4s to connect
    const connectTimer = setTimeout(() => {
      if (!connected) {
        fail(`کارتخوان ${validated.ip}:${validated.port} در شبکه پاسخ نداد (Timeout اتصال).`);
      }
    }, 4000);

    totalTimer = setTimeout(() => {
      // Packet was already sent on TCP socket, terminal might be waiting or not echo response
      const rawBuf = Buffer.concat(chunks);
      const parsed = parsePosTerminalResponse(rawBuf);
      if (rawBuf.length > 0 && parsed.approved !== null) {
        done({
          ok: parsed.approved,
          status: parsed.approved ? 'approved' : 'declined',
          amountRial: numericAmount,
          trackingCode: parsed.trackingCode,
          cardMask: parsed.cardMask,
          responseCode: parsed.responseCode,
          message: parsed.approved
            ? `تراکنش تایید شد${parsed.trackingCode ? ` (شماره پیگیری: ${parsed.trackingCode})` : ''}`
            : (parsed.message || 'تراکنش در کارتخوان تایید نشد.')
        });
      } else {
        done({
          ok: true,
          status: 'sent',
          amountRial: numericAmount,
          trackingCode: parsed.trackingCode || '',
          cardMask: parsed.cardMask || '',
          message: 'مبلغ روی کارتخوان ارسال شد. مشتری کارت را بکشد و سپس ثبت نهایی را بزنید.'
        });
      }
    }, Math.min(Math.max(timeoutMs, 5000), 45000));

    socket.on('connect', () => {
      connected = true;
      clearTimeout(connectTimer);
      socket.write(packet);
    });

    socket.on('data', (chunk) => {
      chunks.push(chunk);
      if (idleReadTimer) clearTimeout(idleReadTimer);
      const combined = Buffer.concat(chunks);
      const parsed = parsePosTerminalResponse(combined);
      if (parsed.parsed && parsed.approved !== null) {
        done({
          ok: parsed.approved,
          status: parsed.approved ? 'approved' : 'declined',
          amountRial: numericAmount,
          trackingCode: parsed.trackingCode,
          cardMask: parsed.cardMask,
          responseCode: parsed.responseCode,
          message: parsed.approved
            ? `پرداخت تایید شد${parsed.trackingCode ? ` (شماره پیگیری: ${parsed.trackingCode})` : ''}`
            : (parsed.message || 'تراکنش توسط کارتخوان لغو یا رد شد.')
        });
        return;
      }

      // Wait briefly for remaining frame bytes, or settle cleanly if terminal sent an ACK
      idleReadTimer = setTimeout(() => {
        const parsedAfter = parsePosTerminalResponse(Buffer.concat(chunks));
        if (parsedAfter.approved === false) {
          done({
            ok: false,
            status: 'declined',
            amountRial: numericAmount,
            trackingCode: parsedAfter.trackingCode,
            cardMask: parsedAfter.cardMask,
            responseCode: parsedAfter.responseCode,
            message: parsedAfter.message || 'تراکنش توسط کارتخوان رد شد.'
          });
        } else if (parsedAfter.approved === true || parsedAfter.trackingCode) {
          done({
            ok: true,
            status: 'approved',
            amountRial: numericAmount,
            trackingCode: parsedAfter.trackingCode,
            cardMask: parsedAfter.cardMask,
            responseCode: parsedAfter.responseCode,
            message: `پرداخت تایید شد${parsedAfter.trackingCode ? ` (شماره پیگیری: ${parsedAfter.trackingCode})` : ''}`
          });
        }
      }, 450);
    });

    socket.on('close', () => {
      if (settled) return;
      const combined = Buffer.concat(chunks);
      const parsed = parsePosTerminalResponse(combined);
      if (!connected) {
        fail(`ارتباط با کارتخوان ${validated.ip}:${validated.port} برقرار نشد.`);
        return;
      }
      if (parsed.approved === false) {
        done({
          ok: false,
          status: 'declined',
          amountRial: numericAmount,
          trackingCode: parsed.trackingCode,
          cardMask: parsed.cardMask,
          responseCode: parsed.responseCode,
          message: parsed.message || 'تراکنش توسط کارتخوان لغو شد.'
        });
      } else {
        done({
          ok: true,
          status: parsed.approved === true || parsed.trackingCode ? 'approved' : 'sent',
          amountRial: numericAmount,
          trackingCode: parsed.trackingCode,
          cardMask: parsed.cardMask,
          responseCode: parsed.responseCode,
          message: parsed.trackingCode
            ? `پرداخت تایید شد (پیگیری: ${parsed.trackingCode})`
            : 'مبلغ با موفقیت به کارتخوان ارسال شد.'
        });
      }
    });

    socket.on('error', (err) => {
      clearTimeout(connectTimer);
      fail(
        err.code === 'ECONNREFUSED'
          ? `کارتخوان ${validated.ip}:${validated.port} اتصال را رد کرد (مطمئن شوید حالت LAN / PC-POS دستگاه روشن است).`
          : `خطا در ارتباط با کارتخوان: ${err.message}`
      );
    });

    socket.connect(validated.port, validated.ip);
  });
}
