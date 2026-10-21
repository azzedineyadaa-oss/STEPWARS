// Complète app.json avec ce qui ne doit pas être commité : la clé Google Maps
// d'Android (variable d'environnement EAS GOOGLE_MAPS_ANDROID_KEY). Sur iPhone,
// la carte utilise Apple Plans et n'a pas besoin de clé.
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...config.plugins,
    ['react-native-maps', { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_KEY }],
  ],
});
