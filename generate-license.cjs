#!/usr/bin/env node
// Arka POS - Server Offline Hardware License Generator Tool
// Used exclusively by Arka System Admin to generate activation keys for clients
const crypto = require('crypto');

const MASTER_SALT = 'ARKA_ENTERPRISE_OFFLINE_SECRET_2026_HARDWARE_LOCK_#POS_SALT!';

function computeActivationKey(machineId) {
  const cleanId = (machineId || '').trim().toUpperCase();
  const hmac = crypto.createHmac('sha256', MASTER_SALT);
  hmac.update(`SERVER_LICENSE:${cleanId}`);
  const signature = hmac.digest('hex').toUpperCase();

  const k1 = signature.slice(0, 4);
  const k2 = signature.slice(6, 10);
  const k3 = signature.slice(12, 16);
  const k4 = signature.slice(18, 22);

  return `ARKA-KEY-${k1}-${k2}-${k3}-${k4}`;
}

const inputMachineId = process.argv[2];

console.log('==============================================================================');
console.log('             Arka POS - Server Hardware License Key Generator                 ');
console.log('==============================================================================');

if (!inputMachineId) {
  console.log('Usage:');
  console.log('  node generate-license.cjs <MACHINE_ID>');
  console.log('');
  console.log('Example:');
  console.log('  node generate-license.cjs ARKA-SRV-A1B2-C3D4-E5F6-G7H8');
  console.log('==============================================================================');
  process.exit(1);
}

const cleanId = inputMachineId.trim().toUpperCase();
const activationKey = computeActivationKey(cleanId);

console.log(` Target Server Machine ID:  ${cleanId}`);
console.log(` Generated Activation Key:  ${activationKey}`);
console.log('==============================================================================');
console.log(' Give this Activation Key to the customer to activate their Arka Server.');
console.log(' This key will ONLY work on this specific computer and cannot be duplicated!');
console.log('==============================================================================');
