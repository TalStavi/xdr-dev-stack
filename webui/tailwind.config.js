/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'cyber-black': '#121212',
        'cyber-dark': '#1a1a1a',
        'cyber-gray': '#2a2a2a',
        'cyber-light': '#3a3a3a',
        'cyber-blue': '#0070f3',
        'cyber-green': '#00cc66',
        'cyber-red': '#ff4040',
        'cyber-yellow': '#ffcc00',
        'cyber-purple': '#9966ff',
        'cyber-text': '#e0e0e0',
      },
      fontFamily: {
        'mono': ['JetBrains Mono', 'monospace'],
        'sans': ['Inter', 'sans-serif'],
      },
      boxShadow: {
        'neon-blue': '0 0 5px #0070f3, 0 0 10px #0070f3',
        'neon-green': '0 0 5px #00cc66, 0 0 10px #00cc66',
        'neon-red': '0 0 5px #ff4040, 0 0 10px #ff4040',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px #0070f3' },
          '100%': { boxShadow: '0 0 20px #0070f3, 0 0 30px #0070f3' }
        }
      }
    },
  },
  plugins: [],
} 