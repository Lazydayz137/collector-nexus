import path from 'path';
import fs from 'fs-extra';
import i18next from 'i18next';
import i18nextFSBackend from 'i18next-fs-backend';
import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';
import { ApiError } from '../middleware/errorHandler';
import config from '../config';

// Supported languages
const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko'] as const;
type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

// Default language
const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

// Language detection order
const LANGUAGE_DETECTION_ORDER: Array<{
  type: 'header' | 'query' | 'cookie' | 'session' | 'path' | 'domain';
  name: string;
  order?: number;
}> = [
  { type: 'path', name: 'lang' },
  { type: 'query', name: 'lang' },
  { type: 'cookie', name: 'i18next' },
  { type: 'header', name: 'accept-language' },
];

// Initialize i18next
async function initializeI18n(localesPath: string) {
  // Ensure the locales directory exists
  await fs.ensureDir(localesPath);
  
  // Initialize i18next
  await i18next
    .use(i18nextFSBackend)
    .init({
      // Debug mode in development
      debug: config.app.env === 'development',
      
      // Default language
      lng: DEFAULT_LANGUAGE,
      fallbackLng: DEFAULT_LANGUAGE,
      
      // Supported languages
      supportedLngs: [...SUPPORTED_LANGUAGES],
      
      // Don't use language detection on the server side
      // We'll handle it in the middleware
      initImmediate: false,
      
      // Backend configuration
      backend: {
        loadPath: path.join(localesPath, '{{lng}}/{{ns}}.json'),
        addPath: path.join(localesPath, '{{lng}}/{{ns}}.missing.json'),
      },
      
      // Namespace configuration
      ns: ['common', 'validation', 'errors', 'emails'],
      defaultNS: 'common',
      
      // Interpolation configuration
      interpolation: {
        escapeValue: false, // Not needed for React
        formatSeparator: ',',
        format: (value, format, lng) => {
          if (format === 'uppercase') return value.toUpperCase();
          if (format === 'lowercase') return value.toLowerCase();
          if (format === 'capitalize') return value.charAt(0).toUpperCase() + value.slice(1);
          if (format === 'currency') return new Intl.NumberFormat(lng, { style: 'currency', currency: 'USD' }).format(value);
          if (format === 'number') return new Intl.NumberFormat(lng).format(value);
          if (format === 'date') return new Intl.DateTimeFormat(lng).format(new Date(value));
          if (format === 'datetime') return new Intl.DateTimeFormat(lng, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
          return value;
        },
      },
      
      // Missing key handling
      saveMissing: true,
      saveMissingTo: 'current',
      missingKeyHandler: (lngs, ns, key, fallbackValue) => {
        logger.warn(`Missing translation key: ${key} for language ${lngs.join(', ')} in namespace ${ns}`);
      },
      
      // Cache
      preload: [DEFAULT_LANGUAGE],
      load: 'currentOnly',
    });
  
  logger.info('i18n initialized');
  return i18next;
}

/**
 * Middleware to detect language from request
 */
function languageDetector() {
  return (req: Request, res: Response, next: NextFunction) => {
    let language = DEFAULT_LANGUAGE;
    
    // Check each detection method in order
    for (const { type, name } of LANGUAGE_DETECTION_ORDER) {
      let detectedLanguage: string | undefined;
      
      switch (type) {
        case 'header':
          if (name === 'accept-language' && req.headers['accept-language']) {
            // Parse Accept-Language header
            const acceptLanguage = req.headers['accept-language'];
            const languages = acceptLanguage.split(',').map(lang => {
              const [code, q = '1'] = lang.trim().split(';q=');
              return { code: code.split('-')[0], q: parseFloat(q) };
            });
            
            // Sort by quality
            languages.sort((a, b) => b.q - a.q);
            
            // Find the first supported language
            const supportedLang = languages.find(lang => 
              SUPPORTED_LANGUAGES.includes(lang.code as SupportedLanguage)
            );
            
            if (supportedLang) {
              detectedLanguage = supportedLang.code;
            }
          }
          break;
          
        case 'query':
          if (req.query[name]) {
            detectedLanguage = req.query[name] as string;
          }
          break;
          
        case 'cookie':
          if (req.cookies && req.cookies[name]) {
            detectedLanguage = req.cookies[name];
          }
          break;
          
        case 'session':
          if (req.session && req.session[name]) {
            detectedLanguage = req.session[name];
          }
          break;
          
        case 'path':
          // This would be handled by your router
          // Example: /:lang/route
          if (req.params && req.params[name]) {
            detectedLanguage = req.params[name];
          }
          break;
          
        case 'domain':
          // Check subdomain for language
          // Example: en.example.com
          const hostname = req.hostname;
          const subdomain = hostname.split('.')[0];
          if (SUPPORTED_LANGUAGES.includes(subdomain as SupportedLanguage)) {
            detectedLanguage = subdomain;
          }
          break;
      }
      
      // If we found a language, use it and break the loop
      if (detectedLanguage) {
        // Clean up the language code (e.g., 'en-US' -> 'en')
        const cleanLanguage = detectedLanguage.split('-')[0].toLowerCase();
        
        // Check if the language is supported
        if (SUPPORTED_LANGUAGES.includes(cleanLanguage as SupportedLanguage)) {
          language = cleanLanguage as SupportedLanguage;
          break;
        }
      }
    }
    
    // Set the language on the request object
    req.language = language;
    
    // Set the language in i18next
    i18next.changeLanguage(language);
    
    // Set the language in the response
    res.setHeader('Content-Language', language);
    
    // Set a cookie for future requests
    res.cookie('i18next', language, {
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
      httpOnly: true,
      sameSite: 'lax',
      secure: config.app.env === 'production',
    });
    
    next();
  };
}

/**
 * Middleware to add i18n to the request object
 */
function i18nMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Add i18n functions to the request object
    req.t = (key: string, options?: any) => {
      return i18next.t(key, { ...options, lng: req.language });
    };
    
    // Add a helper to change the language
    req.changeLanguage = (lng: string) => {
      if (SUPPORTED_LANGUAGES.includes(lng as SupportedLanguage)) {
        req.language = lng as SupportedLanguage;
        i18next.changeLanguage(lng);
        return true;
      }
      return false;
    };
    
    // Add a helper to get the current language
    req.getLanguage = () => req.language;
    
    // Add a helper to get all supported languages
    req.getSupportedLanguages = () => [...SUPPORTED_LANGUAGES];
    
    // Add a helper to check if a language is supported
    req.isLanguageSupported = (lng: string) => {
      return SUPPORTED_LANGUAGES.includes(lng as SupportedLanguage);
    };
    
    next();
  };
}

/**
 * Helper function to translate a key with options
 */
function t(key: string, options?: any, language?: string) {
  return i18next.t(key, { ...options, lng: language });
}

/**
 * Helper function to get the current language
 */
function getLanguage(): string {
  return i18next.language || DEFAULT_LANGUAGE;
}

/**
 * Helper function to change the current language
 */
function changeLanguage(lng: string): Promise<Function> {
  if (!SUPPORTED_LANGUAGES.includes(lng as SupportedLanguage)) {
    return Promise.reject(new Error(`Language '${lng}' is not supported`));
  }
  return i18next.changeLanguage(lng);
}

/**
 * Helper function to get all supported languages
 */
function getSupportedLanguages(): readonly string[] {
  return SUPPORTED_LANGUAGES;
}

/**
 * Helper function to check if a language is supported
 */
function isLanguageSupported(lng: string): boolean {
  return SUPPORTED_LANGUAGES.includes(lng as SupportedLanguage);
}

// Export the i18n utility
export {
  initializeI18n,
  languageDetector,
  i18nMiddleware,
  t,
  getLanguage,
  changeLanguage,
  getSupportedLanguages,
  isLanguageSupported,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
};

export default {
  initialize: initializeI18n,
  middleware: i18nMiddleware(),
  detector: languageDetector(),
  t,
  getLanguage,
  changeLanguage,
  getSupportedLanguages,
  isLanguageSupported,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
};
