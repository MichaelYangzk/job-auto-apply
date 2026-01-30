const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function timestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

export function info(message, ...args) {
  console.log(`${COLORS.gray}[${timestamp()}]${COLORS.reset} ${message}`, ...args);
}

export function success(message, ...args) {
  console.log(`${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.green}✓${COLORS.reset} ${message}`, ...args);
}

export function warn(message, ...args) {
  console.log(`${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.yellow}⚠${COLORS.reset} ${message}`, ...args);
}

export function error(message, ...args) {
  console.log(`${COLORS.gray}[${timestamp()}]${COLORS.reset} ${COLORS.red}✗${COLORS.reset} ${message}`, ...args);
}

export function debug(message, ...args) {
  if (process.env.DEBUG) {
    console.log(`${COLORS.gray}[${timestamp()}] [DEBUG]${COLORS.reset} ${message}`, ...args);
  }
}

export function table(data) {
  console.table(data);
}

export function divider(char = '─', length = 50) {
  console.log(COLORS.gray + char.repeat(length) + COLORS.reset);
}

export function header(text) {
  divider();
  console.log(`${COLORS.bright}${COLORS.cyan}${text}${COLORS.reset}`);
  divider();
}

export default {
  info,
  success,
  warn,
  error,
  debug,
  table,
  divider,
  header
};
