export default {
        content: ["./index.html", "./src/**/*.{js,jsx}"],
        darkMode: "class",
        theme: {
          extend: {
            "colors": {
              "soft-card": "#e2dcc5",
              "surface-container-highest": "#e5e2e1",
              "on-primary": "#ffffff",
              "line": "#829588",
              "accent-purple": "#20746d",
              "surface-container-high": "#ebe7e6",
              "surface-container-lowest": "#ffffff",
              "on-surface": "#203334",
              "accent-orange": "#b94c31",
              "on-surface-variant": "#444748",
              "surface-container": "#f1edec",
              "page-bg": "#f4edda",
              "soft-card-2": "#eae4cc",
              "accent-rose": "#E94057",
              "muted-light": "#b9c7b7",
              "error-container": "#ffdad6",
              "muted": "#55675e",
              "error": "#ba1a1a",
              "white-card": "#fff9e9",
              "primary": "#203334",
              "accent-amber": "#c76340",
            },
            "borderRadius": {
              "DEFAULT": "0.3rem",
              "lg": "0.45rem",
              "xl": "0.6rem",
              "full": "9999px"
            },
            "spacing": {
              "space-xs": "0.5rem",
              "space-xl": "8rem",
              "margin": "2.5rem",
              "space-md": "2rem",
              "gutter": "1.5rem",
              "margin-mobile": "1.25rem",
              "space-section": "10rem",
              "space-sm": "1rem",
              "gutter-lg": "3rem",
              "space-lg": "4rem"
            },
            "fontFamily": {
              "h1-mobile": ["Barlow Condensed", "sans-serif"],
              "display-hero": ["Barlow Condensed", "sans-serif"],
              "h2": ["Barlow Condensed", "sans-serif"],
              "body-md": ["DM Sans", "sans-serif"],
              "label-caps": ["DM Sans", "sans-serif"],
              "display-mobile": ["Barlow Condensed", "sans-serif"],
              "body-lg": ["DM Sans", "sans-serif"],
              "display": ["Barlow Condensed", "sans-serif"],
              "label": ["DM Sans", "sans-serif"],
              "h3": ["Barlow Condensed", "sans-serif"],
              "h1": ["Barlow Condensed", "sans-serif"]
            },
            "fontSize": {
              "h1-mobile": ["32px", { "lineHeight": "1.15", "letterSpacing": "-0.02em", "fontWeight": "700" }],
              "display-hero": ["120px", { "lineHeight": "0.9", "letterSpacing": "-0.05em", "fontWeight": "700" }],
              "h2": ["32px", { "lineHeight": "1.2", "letterSpacing": "-0.02em", "fontWeight": "600" }],
              "body-md": ["15px", { "lineHeight": "1.6", "letterSpacing": "0", "fontWeight": "400" }],
              "label-caps": ["10px", { "lineHeight": "1.0", "letterSpacing": "0.1em", "fontWeight": "700" }],
              "display-mobile": ["44px", { "lineHeight": "1.1", "letterSpacing": "-0.03em", "fontWeight": "700" }],
              "body-lg": ["18px", { "lineHeight": "1.6", "letterSpacing": "0", "fontWeight": "400" }],
              "display": ["82px", { "lineHeight": "1.05", "letterSpacing": "-0.04em", "fontWeight": "700" }],
              "label": ["12px", { "lineHeight": "1.0", "letterSpacing": "0.05em", "fontWeight": "600" }],
              "h3": ["24px", { "lineHeight": "1.3", "letterSpacing": "-0.01em", "fontWeight": "600" }],
              "h1": ["48px", { "lineHeight": "1.1", "letterSpacing": "-0.03em", "fontWeight": "700" }]
            }
          }
        }
      };
