import bundleAudioWorkletPlugin from 'vite-plugin-bundle-audioworklet';

export default {
  base: './',
  build: { target: 'esnext', chunkSizeWarningLimit: 1500 },
  plugins: [bundleAudioWorkletPlugin()],
};
