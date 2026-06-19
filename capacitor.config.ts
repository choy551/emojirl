import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yourname.emojirl',
  appName: 'EmojiRL',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#090910',
      showSpinner: false,
    },
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#090910',
    },
  },
};

export default config;
