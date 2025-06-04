import { format, parseISO, addDays, subDays, addMonths, subMonths, addYears, subYears, isBefore, isAfter, isEqual, differenceInDays, differenceInMonths, differenceInYears, formatDistanceToNow, parse, isValid, isDate } from 'date-fns';
import { utcToZonedTime, zonedTimeToUtc, format as tzFormat } from 'date-fns-tz';

// Timezone to use for date operations (default to system timezone)
const TIMEZONE = process.env.TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Format a date to a human-readable string
 */
const formatDate = (
  date: Date | string | number,
  formatStr: string = 'yyyy-MM-dd',
  timezone: string = TIMEZONE
): string => {
  try {
    let dateObj: Date;
    
    // Parse the input date if it's a string
    if (typeof date === 'string') {
      // Try to parse ISO string
      if (date.includes('T') || date.includes('Z')) {
        dateObj = parseISO(date);
      } else {
        // Handle custom date strings (e.g., '2023-01-01')
        dateObj = new Date(date);
      }
    } else if (typeof date === 'number') {
      dateObj = new Date(date);
    } else {
      dateObj = date;
    }

    // Validate the date
    if (!isValid(dateObj)) {
      throw new Error(`Invalid date: ${date}`);
    }

    // Convert to the specified timezone
    const zonedDate = utcToZonedTime(dateObj, timezone);
    
    // Format the date
    return tzFormat(zonedDate, formatStr, { timeZone: timezone });
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid date';
  }
};

/**
 * Parse a date string into a Date object
 */
const parseDate = (
  dateString: string,
  formatStr: string = 'yyyy-MM-dd',
  timezone: string = TIMEZONE
): Date => {
  try {
    // If the date string is in ISO format, parse it directly
    if (dateString.includes('T') || dateString.includes('Z')) {
      return parseISO(dateString);
    }
    
    // Otherwise, parse using the provided format
    const parsedDate = parse(dateString, formatStr, new Date());
    
    if (!isValid(parsedDate)) {
      throw new Error(`Invalid date string: ${dateString} with format: ${formatStr}`);
    }
    
    // Convert to the specified timezone
    return zonedTimeToUtc(parsedDate, timezone);
  } catch (error) {
    console.error('Error parsing date:', error);
    throw new Error(`Failed to parse date: ${dateString}`);
  }
};

/**
 * Get the current date and time in a specific format
 */
const now = (formatStr?: string, timezone: string = TIMEZONE): string | Date => {
  const now = new Date();
  return formatStr ? formatDate(now, formatStr, timezone) : now;
};

/**
 * Add days to a date
 */
const addToDate = (
  date: Date | string | number,
  amount: number,
  unit: 'days' | 'months' | 'years' = 'days',
  timezone: string = TIMEZONE
): Date => {
  let dateObj = typeof date === 'string' || typeof date === 'number' ? parseDate(date.toString()) : date;
  
  switch (unit) {
    case 'days':
      return addDays(dateObj, amount);
    case 'months':
      return addMonths(dateObj, amount);
    case 'years':
      return addYears(dateObj, amount);
    default:
      throw new Error(`Unsupported time unit: ${unit}`);
  }
};

/**
 * Subtract time from a date
 */
const subtractFromDate = (
  date: Date | string | number,
  amount: number,
  unit: 'days' | 'months' | 'years' = 'days',
  timezone: string = TIMEZONE
): Date => {
  let dateObj = typeof date === 'string' || typeof date === 'number' ? parseDate(date.toString()) : date;
  
  switch (unit) {
    case 'days':
      return subDays(dateObj, amount);
    case 'months':
      return subMonths(dateObj, amount);
    case 'years':
      return subYears(dateObj, amount);
    default:
      throw new Error(`Unsupported time unit: ${unit}`);
  }
};

/**
 * Get the difference between two dates
 */
const dateDiff = (
  date1: Date | string | number,
  date2: Date | string | number = new Date(),
  unit: 'days' | 'months' | 'years' = 'days'
): number => {
  const d1 = typeof date1 === 'string' || typeof date1 === 'number' ? new Date(date1) : date1;
  const d2 = typeof date2 === 'string' || typeof date2 === 'number' ? new Date(date2) : date2;
  
  switch (unit) {
    case 'days':
      return differenceInDays(d1, d2);
    case 'months':
      return differenceInMonths(d1, d2);
    case 'years':
      return differenceInYears(d1, d2);
    default:
      throw new Error(`Unsupported time unit: ${unit}`);
  }
};

/**
 * Check if a date is between two other dates
 */
const isDateBetween = (
  date: Date | string | number,
  startDate: Date | string | number,
  endDate: Date | string | number,
  inclusive: boolean = true
): boolean => {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  const start = typeof startDate === 'string' || typeof startDate === 'number' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' || typeof endDate === 'number' ? new Date(endDate) : endDate;
  
  if (inclusive) {
    return (isAfter(d, start) || isEqual(d, start)) && (isBefore(d, end) || isEqual(d, end));
  } else {
    return isAfter(d, start) && isBefore(d, end);
  }
};

/**
 * Get a human-readable relative time string (e.g., "2 days ago")
 */
const timeAgo = (date: Date | string | number): string => {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
};

/**
 * Format a date range as a string (e.g., "Jan 1 - 15, 2023")
 */
const formatDateRange = (
  startDate: Date | string | number,
  endDate: Date | string | number,
  options: {
    format?: string;
    separator?: string;
    sameMonthFormat?: string;
    sameYearFormat?: string;
  } = {}
): string => {
  const {
    format = 'MMM d',
    separator = ' - ',
    sameMonthFormat = 'd',
    sameYearFormat = 'MMM d',
  } = options;
  
  const start = typeof startDate === 'string' || typeof startDate === 'number' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' || typeof endDate === 'number' ? new Date(endDate) : endDate;
  
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  const startMonth = start.getMonth();
  const endMonth = end.getMonth();
  
  let startFormat = format;
  let endFormat = format;
  
  if (startYear === endYear) {
    if (startMonth === endMonth) {
      // Same month and year
      startFormat = sameMonthFormat;
      endFormat = format;
    } else {
      // Same year, different months
      startFormat = sameYearFormat;
      endFormat = format;
    }
  }
  
  const formattedStart = formatDate(start, startFormat);
  const formattedEnd = formatDate(end, endFormat);
  
  return `${formattedStart}${separator}${formattedEnd}`;
};

/**
 * Get the start and end of a day, week, month, or year
 */
const getDateRange = (
  date: Date | string | number = new Date(),
  range: 'day' | 'week' | 'month' | 'year' = 'day',
  timezone: string = TIMEZONE
): { start: Date; end: Date } => {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  const zonedDate = utcToZonedTime(d, timezone);
  
  let start: Date;
  let end: Date;
  
  switch (range) {
    case 'day':
      start = new Date(zonedDate.setHours(0, 0, 0, 0));
      end = new Date(zonedDate.setHours(23, 59, 59, 999));
      break;
    case 'week':
      const day = zonedDate.getDay();
      const diff = zonedDate.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
      start = new Date(zonedDate.setDate(diff));
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      break;
    case 'month':
      start = new Date(zonedDate.getFullYear(), zonedDate.getMonth(), 1);
      end = new Date(zonedDate.getFullYear(), zonedDate.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'year':
      start = new Date(zonedDate.getFullYear(), 0, 1);
      end = new Date(zonedDate.getFullYear(), 11, 31);
      end.setHours(23, 59, 59, 999);
      break;
    default:
      throw new Error(`Unsupported range: ${range}`);
  }
  
  return {
    start: zonedTimeToUtc(start, timezone),
    end: zonedTimeToUtc(end, timezone),
  };
};

export {
  formatDate,
  parseDate,
  now,
  addToDate,
  subtractFromDate,
  dateDiff,
  isDateBetween,
  timeAgo,
  formatDateRange,
  getDateRange,
  TIMEZONE,
};
