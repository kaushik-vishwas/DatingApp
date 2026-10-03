const { getSentryExpoConfig } = require('@sentry/react-native/metro');

/** Expo Metro config plus Sentry source-map serialization. */
const config = getSentryExpoConfig(__dirname);

module.exports = config;
