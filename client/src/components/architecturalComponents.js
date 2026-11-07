// ─── 2D ARCHITECTURAL MEETING ROOM DESIGN SYSTEM ─────────────────────────────
// Precision floor-plan models, design variations, and vector renderers
// for ProxiSpeak Custom Office Designer & World Canvas.

// Helper for drawing rounded rectangles with cross-browser compatibility
export function roundRect(ctx, x, y, w, h, r = 4) {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

// Helper: 2D Architectural Executive Chair with Armrests and Curved Backrest
export function drawArchitecturalChair(ctx, cx, cy, angle = 0, style = 'leather', color = '#78350f', isSelected = false) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  // Chair cast shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.beginPath();
  ctx.ellipse(0, 2, 12, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  // Armrests (left and right)
  ctx.fillStyle = '#334155';
  roundRect(ctx, -13, -8, 3.5, 16, 1.5);
  ctx.fill();
  roundRect(ctx, 9.5, -8, 3.5, 16, 1.5);
  ctx.fill();

  // Main seat cushion
  ctx.fillStyle = color || '#78350f';
  roundRect(ctx, -10, -9, 20, 18, 4);
  ctx.fill();

  // Cushion stitching / piping detail
  ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(0, 0, 0, 0.25)';
  ctx.lineWidth = isSelected ? 2 : 1;
  ctx.stroke();

  // Curved ergonomic backrest
  ctx.fillStyle = '#1e293b';
  roundRect(ctx, -11, 8, 22, 5.5, 2.5);
  ctx.fill();

  // Lumbar accent line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-8, 10.5);
  ctx.lineTo(8, 10.5);
  ctx.stroke();

  ctx.restore();
}

// Helper: 2D Architectural Widescreen Monitor + Stand
export function drawArchitecturalMonitor(ctx, cx, cy, angle = 0, screenColor = '#38bdf8') {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  // Monitor base stand
  ctx.fillStyle = '#475569';
  roundRect(ctx, -6, 2, 12, 4, 1.5);
  ctx.fill();

  // Display housing (ultra-slim bezel)
  ctx.fillStyle = '#0f172a';
  roundRect(ctx, -18, -4, 36, 6, 2);
  ctx.fill();

  // Active display glow
  ctx.fillStyle = screenColor || '#38bdf8';
  roundRect(ctx, -16, -3, 32, 4, 1);
  ctx.fill();

  ctx.restore();
}

// ─── ACOUSTIC CATALOG CONFIGURATION ──────────────────────────────────────────
export const ACOUSTIC_VARIATIONS = {
  wall: [
    {
      id: 'concrete_stud',
      name: 'Reinforced Concrete & Stud',
      shortName: 'Concrete Stud',
      icon: 'architecture',
      badge: '-70dB Barrier',
      desc: 'Dense structural concrete core with double-line architectural boundary and reinforcement studs.',
      defaultColor: '#2c3050',
      defaultThickness: 10,
      defaultLength: 120,
      availableColors: [
        { name: 'Slate Concrete', hex: '#2c3050' },
        { name: 'Obsidian Black', hex: '#1e293b' },
        { name: 'Charcoal Industrial', hex: '#334155' },
        { name: 'Studio White', hex: '#cbd5e1' },
      ],
      thicknessOptions: [
        { label: 'Slim (6px)', val: 6 },
        { label: 'Standard (10px)', val: 10 },
        { label: 'Heavy (16px)', val: 16 },
      ],
      lengthPresets: [60, 120, 180, 240, 300],
    },
    {
      id: 'slatted_timber',
      name: 'Slatted Acoustic Timber',
      shortName: 'Slatted Wood',
      icon: 'view_week',
      badge: 'Echo Diffuser',
      desc: 'Natural architectural wood paneling with vertical acoustic diffusion slats to soften speech reflections.',
      defaultColor: '#854d0e',
      defaultThickness: 12,
      defaultLength: 120,
      availableColors: [
        { name: 'Warm Walnut', hex: '#854d0e' },
        { name: 'Deep Oak', hex: '#78350f' },
        { name: 'Natural Ash', hex: '#b45309' },
        { name: 'Ebony Wood', hex: '#27272a' },
      ],
      thicknessOptions: [
        { label: 'Slim (8px)', val: 8 },
        { label: 'Standard (12px)', val: 12 },
        { label: 'Heavy (16px)', val: 16 },
      ],
      lengthPresets: [60, 120, 180, 240, 300],
    },
    {
      id: 'glass_partition',
      name: 'Double-Glazed Acoustic Glass',
      shortName: 'Acoustic Glass',
      icon: 'window',
      badge: 'Sound Seal Glass',
      desc: 'Translucent soundproof double-glazing with aluminum mullion caps and sound-dampening vacuum layer.',
      defaultColor: '#0284c7',
      defaultThickness: 8,
      defaultLength: 120,
      availableColors: [
        { name: 'Frosted Cyan', hex: '#0284c7' },
        { name: 'Sky Tint', hex: '#38bdf8' },
        { name: 'Smoke Glass', hex: '#475569' },
        { name: 'Clear Frost', hex: '#94a3b8' },
      ],
      thicknessOptions: [
        { label: 'Slim (6px)', val: 6 },
        { label: 'Standard (8px)', val: 8 },
        { label: 'Heavy (12px)', val: 12 },
      ],
      lengthPresets: [60, 120, 180, 240, 300],
    },
  ],
  door: [
    {
      id: 'single_swing',
      name: 'Single Architectural Door',
      shortName: 'Single Swing',
      icon: 'meeting_room',
      badge: 'Standard 90°',
      desc: 'Standard architectural flush door with brass pivot hinge and 90° swing arc floor clearance.',
      defaultColor: '#78350f',
      defaultWidth: 90,
      availableColors: [
        { name: 'Rich Walnut', hex: '#78350f' },
        { name: 'Executive Oak', hex: '#a16207' },
        { name: 'Anodized Slate', hex: '#334155' },
        { name: 'Matte Black', hex: '#18181b' },
      ],
      widthPresets: [70, 90, 110],
    },
    {
      id: 'double_swing',
      name: 'Double French Boardroom Door',
      shortName: 'Double Swing',
      icon: 'door_sliding',
      badge: 'Dual 90° French',
      desc: 'Biparting executive double doors with dual symmetrical swing arcs meeting at center opening.',
      defaultColor: '#78350f',
      defaultWidth: 140,
      availableColors: [
        { name: 'Rich Walnut', hex: '#78350f' },
        { name: 'Executive Oak', hex: '#a16207' },
        { name: 'Anodized Slate', hex: '#334155' },
        { name: 'Matte Black', hex: '#18181b' },
      ],
      widthPresets: [120, 140, 160, 180],
    },
    {
      id: 'sliding_pocket',
      name: 'Acoustic Sliding Pocket Door',
      shortName: 'Sliding Pocket',
      icon: 'swipe',
      badge: 'Zero Swing Track',
      desc: 'Space-saving sliding acoustic panel on recessed wall track with directional motion indicators.',
      defaultColor: '#0284c7',
      defaultWidth: 90,
      availableColors: [
        { name: 'Frosted Glass', hex: '#0284c7' },
        { name: 'Anodized Aluminum', hex: '#475569' },
        { name: 'Walnut Wood', hex: '#78350f' },
        { name: 'Matte Obsidian', hex: '#1e293b' },
      ],
      widthPresets: [80, 90, 110, 130],
    },
    {
      id: 'glass_frameless',
      name: 'Modern Frameless Glass Door',
      shortName: 'Frameless Glass',
      icon: 'crop_portrait',
      badge: 'Modern Glass',
      desc: 'Contemporary frameless acoustic glass leaf with stainless steel pivot patch fittings and pull bar.',
      defaultColor: '#0ea5e9',
      defaultWidth: 90,
      availableColors: [
        { name: 'Frosted Sky', hex: '#0ea5e9' },
        { name: 'Crystal Clear', hex: '#38bdf8' },
        { name: 'Smoked Obsidian', hex: '#334155' },
      ],
      widthPresets: [70, 90, 110],
    },
    {
      id: 'modern_sound_lock',
      name: 'Sound-Lock Security Door',
      shortName: 'Sound-Lock Seal',
      icon: 'lock',
      badge: 'Max Isolation',
      desc: 'Heavy magnetic drop-seal perimeter gasket with reinforced acoustic core and push-bar latch.',
      defaultColor: '#1e293b',
      defaultWidth: 100,
      availableColors: [
        { name: 'Security Slate', hex: '#1e293b' },
        { name: 'Industrial Bronze', hex: '#78350f' },
        { name: 'Stainless Silver', hex: '#475569' },
      ],
      widthPresets: [90, 100, 120],
    },
  ],
  zone: [
    {
      id: 'focus_pod',
      name: 'Private Focus Pod (Quiet Booth)',
      shortName: 'Focus Pod',
      icon: 'headphones',
      badge: '-85% Bleed · 50px',
      desc: 'Compact acoustic isolation perimeter with corner foam diffusers for phone booths and solo focus.',
      defaultColor: '#10b981',
      defaultWidth: 180,
      defaultHeight: 140,
      defaultMaxDist: 60,
      availablePresets: [
        { label: 'Solo Pod (160×120)', w: 160, h: 120 },
        { label: 'Standard Pod (180×140)', w: 180, h: 140 },
        { label: 'Duo Focus (220×160)', w: 220, h: 160 },
      ],
    },
    {
      id: 'meeting_suite',
      name: 'Collaborative Meeting Suite',
      shortName: 'Meeting Suite',
      icon: 'groups',
      badge: '-70% Bleed · 100px',
      desc: 'Standard architectural conference room perimeter with 4 corner bass-traps and perimeter boundary wash.',
      defaultColor: '#0284c7',
      defaultWidth: 280,
      defaultHeight: 200,
      defaultMaxDist: 100,
      availablePresets: [
        { label: 'Huddle Room (240×180)', w: 240, h: 180 },
        { label: 'Team Suite (280×200)', w: 280, h: 200 },
        { label: 'Conference (360×260)', w: 360, h: 260 },
      ],
    },
    {
      id: 'boardroom_vault',
      name: 'Executive Boardroom Vault',
      shortName: 'Boardroom Vault',
      icon: 'shield',
      badge: '-95% Bleed · Max Vault',
      desc: 'High-privacy acoustic vault with double-contour sound barrier contour and corner acoustic baffles.',
      defaultColor: '#6366f1',
      defaultWidth: 420,
      defaultHeight: 280,
      defaultMaxDist: 120,
      availablePresets: [
        { label: 'Executive Board (400×260)', w: 400, h: 260 },
        { label: 'Grand Vault (440×300)', w: 440, h: 300 },
        { label: 'Townhall Suite (540×360)', w: 540, h: 360 },
      ],
    },
  ],
};

// ─── FURNITURE & DECOR CATALOG CONFIGURATION ─────────────────────────────────
export const FURNITURE_VARIATIONS = {
  conf_table: [
    {
      id: 'rectangular_executive',
      name: 'Executive Mahogany Boardroom',
      shortName: 'Executive Table',
      icon: 'table_restaurant',
      badge: '10 Seats · Raceway',
      desc: 'Solid beveled conference table with recessed cable raceway and 10 executive ergonomic armchairs.',
      defaultColor: '#78350f',
      defaultW: 320,
      defaultH: 150,
      seats: 10,
      availableColors: [
        { name: 'Warm Mahogany', hex: '#78350f' },
        { name: 'Deep Walnut', hex: '#522e06' },
        { name: 'Obsidian Granite', hex: '#1e293b' },
        { name: 'Nordic Bleached Ash', hex: '#cbd5e1' },
      ],
      dimensionPresets: [
        { label: 'Standard (260×130) · 8 Seats', w: 260, h: 130, seats: 8 },
        { label: 'Executive (320×150) · 10 Seats', w: 320, h: 150, seats: 10 },
        { label: 'Grand Board (380×170) · 12 Seats', w: 380, h: 170, seats: 12 },
      ],
    },
    {
      id: 'racetrack_oval',
      name: 'Racetrack Capsule Conference',
      shortName: 'Racetrack Oval',
      icon: 'oval',
      badge: '10 Seats · Curved Ends',
      desc: 'Architectural capsule table with soft semi-circular ends, center veneer inlay, and wrap-around armchairs.',
      defaultColor: '#854d0e',
      defaultW: 320,
      defaultH: 140,
      seats: 10,
      availableColors: [
        { name: 'Warm Walnut', hex: '#854d0e' },
        { name: 'Executive Oak', hex: '#a16207' },
        { name: 'Matte Obsidian', hex: '#1e293b' },
        { name: 'Bleached Birch', hex: '#e2e8f0' },
      ],
      dimensionPresets: [
        { label: 'Compact (260×120) · 8 Seats', w: 260, h: 120, seats: 8 },
        { label: 'Executive (320×140) · 10 Seats', w: 320, h: 140, seats: 10 },
        { label: 'Grand Oval (380×160) · 12 Seats', w: 380, h: 160, seats: 12 },
      ],
    },
    {
      id: 'modular_u_shape',
      name: 'Video Conference U-Shape Table',
      shortName: 'U-Shape Presentation',
      icon: 'view_agenda',
      badge: '12 Seats · AV Open Center',
      desc: 'U-shaped modular conference table facing the presentation screen with individual mic discs and peripheral seating.',
      defaultColor: '#334155',
      defaultW: 340,
      defaultH: 220,
      seats: 12,
      availableColors: [
        { name: 'Studio Slate', hex: '#334155' },
        { name: 'Rich Walnut', hex: '#78350f' },
        { name: 'Bleached Maple', hex: '#cbd5e1' },
      ],
      dimensionPresets: [
        { label: 'Compact U (280×180)', w: 280, h: 180, seats: 10 },
        { label: 'Standard U (340×220)', w: 340, h: 220, seats: 12 },
        { label: 'Grand Townhall U (400×260)', w: 400, h: 260, seats: 14 },
      ],
    },
    {
      id: 'circular_round',
      name: 'Round Executive Roundtable',
      shortName: 'Roundtable',
      icon: 'circle',
      badge: '8 Seats · Equal Weight',
      desc: 'Democratic circular conference table with central revolving cable hub and radially spaced executive chairs.',
      defaultColor: '#92400e',
      defaultW: 190,
      defaultH: 190,
      seats: 8,
      availableColors: [
        { name: 'Deep Cherry', hex: '#92400e' },
        { name: 'Obsidian Black', hex: '#18181b' },
        { name: 'Nordic Birch', hex: '#e2e8f0' },
        { name: 'Smoked Glass', hex: '#0f766e' },
      ],
      dimensionPresets: [
        { label: 'Huddle Round (150×150) · 6 Seats', w: 150, h: 150, seats: 6 },
        { label: 'Executive Round (190×190) · 8 Seats', w: 190, h: 190, seats: 8 },
        { label: 'Grand Round (240×240) · 10 Seats', w: 240, h: 240, seats: 10 },
      ],
    },
    {
      id: 'glass_minimalist',
      name: 'Frosted Glass Minimalist Table',
      shortName: 'Glass Conference',
      icon: 'window',
      badge: '8 Seats · Chrome Truss',
      desc: 'Contemporary frosted acoustic glass tabletop with double-line brushed stainless frame and cantilevered mesh chairs.',
      defaultColor: '#0284c7',
      defaultW: 280,
      defaultH: 130,
      seats: 8,
      availableColors: [
        { name: 'Frosted Sky', hex: '#0284c7' },
        { name: 'Smoke Tint', hex: '#334155' },
        { name: 'Crystal Frost', hex: '#38bdf8' },
      ],
      dimensionPresets: [
        { label: 'Standard Glass (260×120) · 8 Seats', w: 260, h: 120, seats: 8 },
        { label: 'Executive Glass (300×140) · 10 Seats', w: 300, h: 140, seats: 10 },
      ],
    },
  ],

  desk: [
    {
      id: 'dual_bench',
      name: 'Dual Collaborative Workstation',
      shortName: 'Dual Bench',
      icon: 'desktop_windows',
      badge: '2 Users · Acoustic Screen',
      desc: 'Face-to-face 2-person workstation with vertical fabric acoustic partition screen, dual displays, and ergonomic swivel chairs.',
      defaultColor: '#cbd5e1',
      defaultW: 180,
      defaultH: 100,
      availableColors: [
        { name: 'Studio Mist', hex: '#cbd5e1' },
        { name: 'Warm Birch', hex: '#d97706' },
        { name: 'Dark Industrial', hex: '#334155' },
        { name: 'Clean White', hex: '#f1f5f9' },
      ],
      dimensionPresets: [
        { label: 'Compact Duo (140×85)', w: 140, h: 85 },
        { label: 'Standard Duo (180×100)', w: 180, h: 100 },
        { label: 'Spacious Duo (220×110)', w: 220, h: 110 },
      ],
    },
    {
      id: 'executive_l_desk',
      name: 'Private Executive L-Desk Suite',
      shortName: 'Executive L-Desk',
      icon: 'space_dashboard',
      badge: '1 Exec + 2 Guests',
      desc: 'Executive desk with credenza side return, dual widescreen monitors, leather swivel armchair, and 2 front visitor chairs.',
      defaultColor: '#78350f',
      defaultW: 180,
      defaultH: 140,
      availableColors: [
        { name: 'Executive Walnut', hex: '#78350f' },
        { name: 'Slate Granite', hex: '#1e293b' },
        { name: 'Bleached Ash', hex: '#cbd5e1' },
      ],
      dimensionPresets: [
        { label: 'Standard Suite (180×140)', w: 180, h: 140 },
        { label: 'Corner Grand (220×160)', w: 220, h: 160 },
      ],
    },
    {
      id: 'quad_cluster',
      name: '4-Person Agile Team Pod',
      shortName: 'Quad Pod',
      icon: 'grid_view',
      badge: '4 Users · 4 Chairs',
      desc: 'Four workstations configured in a cross-divided quad pod with central acoustic screens, 4 monitors, and task chairs.',
      defaultColor: '#334155',
      defaultW: 220,
      defaultH: 180,
      availableColors: [
        { name: 'Slate Navy', hex: '#334155' },
        { name: 'Natural Oak', hex: '#a16207' },
        { name: 'Clean Ash', hex: '#cbd5e1' },
      ],
      dimensionPresets: [
        { label: 'Compact Quad (180×150)', w: 180, h: 150 },
        { label: 'Standard Quad (220×180)', w: 220, h: 180 },
        { label: 'Expanded Quad (260×210)', w: 260, h: 210 },
      ],
    },
    {
      id: 'standing_desk_cluster',
      name: 'Motorized Adjustable Standing Desk',
      shortName: 'Standing Desk',
      icon: 'height',
      badge: 'Ergonomic · Cable Vertebra',
      desc: 'Height-adjustable electric standing desk with beveled wood top, dual monitor articulating arm, and mesh task chair.',
      defaultColor: '#b45309',
      defaultW: 140,
      defaultH: 80,
      availableColors: [
        { name: 'Golden Oak', hex: '#b45309' },
        { name: 'Walnut', hex: '#78350f' },
        { name: 'Minimalist Black', hex: '#18181b' },
        { name: 'White Laminate', hex: '#f8fafc' },
      ],
      dimensionPresets: [
        { label: 'Solo Standing (130×75)', w: 130, h: 75 },
        { label: 'Wide Dual-Display (160×85)', w: 160, h: 85 },
      ],
    },
  ],

  sofa: [
    {
      id: 'linear_cushioned',
      name: '3-Seater Linear Executive Sofa',
      shortName: 'Linear Sofa',
      icon: 'weekend',
      badge: '3-Seater · Padded Arms',
      desc: 'Deep lounge sofa with 3 tailored seat cushions, padded armrests, piped backrest stitching, and accent throw pillows.',
      defaultColor: '#334155',
      defaultW: 180,
      defaultH: 75,
      availableColors: [
        { name: 'Midnight Slate', hex: '#334155' },
        { name: 'Royal Navy', hex: '#1e3a8a' },
        { name: 'Cognac Leather', hex: '#9a3412' },
        { name: 'Forest Pine', hex: '#064e3b' },
        { name: 'Studio Oatmeal', hex: '#94a3b8' },
      ],
      dimensionPresets: [
        { label: '2-Seater Loveseat (130×70)', w: 130, h: 70 },
        { label: '3-Seater Executive (180×75)', w: 180, h: 75 },
        { label: '4-Seater Lounge (230×80)', w: 230, h: 80 },
      ],
    },
    {
      id: 'l_sectional',
      name: 'L-Shaped Corner Modular Sectional',
      shortName: 'L-Sectional',
      icon: 'view_quilt',
      badge: 'Corner Huddle · Chaise',
      desc: 'Corner sectional sofa with chaise lounge extension, seamless corner wedge, and integrated wood side ledge.',
      defaultColor: '#1e293b',
      defaultW: 200,
      defaultH: 160,
      availableColors: [
        { name: 'Obsidian Slate', hex: '#1e293b' },
        { name: 'Navy Velvet', hex: '#1e3a8a' },
        { name: 'Warm Terracotta', hex: '#9a3412' },
        { name: 'Cement Grey', hex: '#475569' },
      ],
      dimensionPresets: [
        { label: 'Compact Sectional (170×140)', w: 170, h: 140 },
        { label: 'Standard Sectional (200×160)', w: 200, h: 160 },
        { label: 'Grand Hospitality (240×190)', w: 240, h: 190 },
      ],
    },
    {
      id: 'curved_banquette',
      name: 'Curved Acoustic Huddle Banquette',
      shortName: 'Curved Banquette',
      icon: 'rotate_90_degrees_ccw',
      badge: 'Huddle Arc · Coffee Table',
      desc: 'Semi-circular banquette booth wrapping around a central low circular oak coffee table for informal breakout audio chats.',
      defaultColor: '#0f766e',
      defaultW: 220,
      defaultH: 150,
      availableColors: [
        { name: 'Teal Emerald', hex: '#0f766e' },
        { name: 'Royal Indigo', hex: '#3730a3' },
        { name: 'Charcoal', hex: '#1e293b' },
        { name: 'Warm Sand', hex: '#78350f' },
      ],
      dimensionPresets: [
        { label: 'Huddle Banquette (220×150)', w: 220, h: 150 },
        { label: 'Large Banquette (260×180)', w: 260, h: 180 },
      ],
    },
    {
      id: 'accent_armchairs_set',
      name: 'Designer Lounge Club Chair Duo',
      shortName: 'Club Chairs & Table',
      icon: 'chair',
      badge: '2 Armchairs · Low Table',
      desc: 'Pair of angled executive club armchairs positioned across an oblong coffee table for 1-on-1 casual conversations.',
      defaultColor: '#9a3412',
      defaultW: 180,
      defaultH: 90,
      availableColors: [
        { name: 'Cognac Caramel', hex: '#9a3412' },
        { name: 'Slate Blue', hex: '#1e3a8a' },
        { name: 'Forest Green', hex: '#064e3b' },
        { name: 'Heather Grey', hex: '#475569' },
      ],
      dimensionPresets: [
        { label: 'Standard Duo (180×90)', w: 180, h: 90 },
        { label: 'Spacious Duo (220×100)', w: 220, h: 100 },
      ],
    },
  ],

  server_rack: [
    {
      id: 'enterprise_rack',
      name: '42U Enclosed Server Cabinet',
      shortName: '42U Server Rack',
      icon: 'dns',
      badge: 'Enterprise IT · Dual PDU',
      desc: 'Heavy datacenter enclosure with perforated front mesh, active telemetry LEDs (emerald/cyan), and dual power distribution rails.',
      defaultColor: '#0f172a',
      defaultW: 75,
      defaultH: 120,
      availableColors: [
        { name: 'Datacenter Black', hex: '#0f172a' },
        { name: 'Industrial Charcoal', hex: '#1e293b' },
        { name: 'Server Silver', hex: '#475569' },
      ],
      dimensionPresets: [
        { label: 'Single 42U (75×120)', w: 75, h: 120 },
        { label: 'Double Bay (140×120)', w: 140, h: 120 },
      ],
    },
    {
      id: 'blade_chassis',
      name: 'High-Density Blade Enclosure',
      shortName: 'Blade Chassis',
      icon: 'developer_board',
      badge: 'High-Density · Fan Bank',
      desc: 'Modular blade server chassis with high-speed cooling fan array, fiber channel ports, and diagnostic indicator panels.',
      defaultColor: '#1e293b',
      defaultW: 80,
      defaultH: 130,
      availableColors: [
        { name: 'Obsidian Slate', hex: '#1e293b' },
        { name: 'Tech Teal', hex: '#0e7490' },
        { name: 'Cyber Blue', hex: '#1d4ed8' },
      ],
      dimensionPresets: [
        { label: 'Standard Chassis (80×130)', w: 80, h: 130 },
        { label: 'Expanded Pod (150×130)', w: 150, h: 130 },
      ],
    },
    {
      id: 'open_frame_lab',
      name: '4-Post Open Frame Lab Rack',
      shortName: 'Open Frame Rack',
      icon: 'hub',
      badge: 'Open Frame · Patch Bays',
      desc: 'Open 4-post development rack with exposed patch cables, cable management d-rings, and RJ45 switch bays.',
      defaultColor: '#334155',
      defaultW: 70,
      defaultH: 100,
      availableColors: [
        { name: 'Rack Slate', hex: '#334155' },
        { name: 'Bare Steel', hex: '#64748b' },
        { name: 'Safety Bronze', hex: '#854d0e' },
      ],
      dimensionPresets: [
        { label: 'Lab Rack (70×100)', w: 70, h: 100 },
        { label: 'Double Lab (130×100)', w: 130, h: 100 },
      ],
    },
  ],

  plant: [
    {
      id: 'monstera_deliciosa',
      name: 'Potted Monstera Deliciosa',
      shortName: 'Monstera Plant',
      icon: 'potted_plant',
      badge: 'Organic Leaves · Terracotta',
      desc: 'Natural biophilic monstera plant with layered organic split leaves, terracotta rimmed pot, and rich potting soil ring.',
      defaultColor: '#22c55e',
      defaultR: 22,
      availableColors: [
        { name: 'Vibrant Emerald', hex: '#22c55e' },
        { name: 'Deep Jungle', hex: '#15803d' },
        { name: 'Lime Mist', hex: '#4ade80' },
      ],
      dimensionPresets: [
        { label: 'Small (r: 16)', r: 16 },
        { label: 'Medium (r: 22)', r: 22 },
        { label: 'Large Specimen (r: 30)', r: 30 },
      ],
    },
    {
      id: 'ficus_lyrata',
      name: 'Architectural Fiddle-Leaf Fig',
      shortName: 'Fiddle-Leaf Fig',
      icon: 'nature',
      badge: 'Broad Canopy · Ceramic',
      desc: 'Upright architectural indoor tree with broad violin-shaped leaves and modern ceramic cylindrical planter.',
      defaultColor: '#16a34a',
      defaultR: 24,
      availableColors: [
        { name: 'Deep Forest', hex: '#16a34a' },
        { name: 'Olive Moss', hex: '#65a30d' },
        { name: 'Dark Jade', hex: '#047857' },
      ],
      dimensionPresets: [
        { label: 'Medium (r: 20)', r: 20 },
        { label: 'Large (r: 26)', r: 26 },
        { label: 'Grand (r: 32)', r: 32 },
      ],
    },
    {
      id: 'planter_partition_box',
      name: 'Rectangular Acoustic Planter Divider',
      shortName: 'Planter Divider',
      icon: 'table_rows',
      badge: 'Green Barrier · Sound Diffuser',
      desc: 'Long architectural trough planter box with dense multi-leaf foliage that acts as an acoustic green privacy divider.',
      defaultColor: '#15803d',
      defaultW: 140,
      defaultH: 36,
      availableColors: [
        { name: 'Forest Lush', hex: '#15803d' },
        { name: 'Bright Lime', hex: '#22c55e' },
        { name: 'Variegated Ash', hex: '#10b981' },
      ],
      dimensionPresets: [
        { label: 'Standard Divider (140×36)', w: 140, h: 36 },
        { label: 'Long Divider (200×36)', w: 200, h: 36 },
      ],
    },
  ],

  spawn: [
    {
      id: 'executive_carpet',
      name: 'Executive Arrival Runner Carpet',
      shortName: 'Arrival Carpet',
      icon: 'my_location',
      badge: 'Executive Welcome · Brass Trim',
      desc: 'Tailored architectural arrival rug with geometric border weave, brass corner tabs, and glowing center beacon disk.',
      defaultColor: '#3b82f6',
      availableColors: [
        { name: 'Royal Azure', hex: '#3b82f6' },
        { name: 'Emerald Gold', hex: '#10b981' },
        { name: 'Burgundy Velvet', hex: '#991b1b' },
        { name: 'Obsidian Slate', hex: '#334155' },
      ],
    },
    {
      id: 'spatial_compass',
      name: 'Technical Spatial Audio Compass Rose',
      shortName: 'Spatial Compass',
      icon: 'explore',
      badge: 'Compass Rose · 3D Radar',
      desc: 'Precision floor navigation compass rose with cardinal axes (N, S, E, W), radial earshot calibration ring, and center drop target.',
      defaultColor: '#0284c7',
      availableColors: [
        { name: 'Cyber Cyan', hex: '#0284c7' },
        { name: 'Neon Emerald', hex: '#10b981' },
        { name: 'Amber Radar', hex: '#f59e0b' },
      ],
    },
  ],
};

// ─── 1. ARCHITECTURAL WALL RENDERER ──────────────────────────────────────────
export function drawArchitecturalWall(ctx, w, isGhost = false, isSelected = false) {
  const {
    x, y, w: width, h: height,
    rotation = 0,
    variation = 'concrete_stud',
    color = '#2c3050',
  } = w;

  ctx.save();
  if (rotation && rotation !== 90 && rotation !== 180 && rotation !== 270) {
    const cx = x + width / 2;
    const cy = y + height / 2;
    ctx.translate(cx, cy);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }

  const isVert = height > width;
  const len = isVert ? height : width;
  const th = isVert ? width : height;

  if (isGhost) ctx.globalAlpha = 0.75;

  if (variation === 'slatted_timber') {
    ctx.fillStyle = color || '#854d0e';
    ctx.fillRect(x, y, width, height);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    const slatStep = 13;
    if (isVert) {
      for (let sy = y + 4; sy < y + height - 4; sy += slatStep) {
        ctx.fillRect(x + 1, sy, width - 2, 2.5);
      }
    } else {
      for (let sx = x + 4; sx < x + width - 4; sx += slatStep) {
        ctx.fillRect(sx, y + 1, 2.5, height - 2);
      }
    }

    ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = isSelected ? 2.5 : 1;
    ctx.strokeRect(x, y, width, height);

  } else if (variation === 'glass_partition') {
    ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
    ctx.fillRect(x, y, width, height);

    ctx.fillStyle = '#64748b';
    if (isVert) {
      ctx.fillRect(x, y, width, 4);
      ctx.fillRect(x, y + height - 4, width, 4);
      if (height > 90) ctx.fillRect(x, y + height / 2 - 2, width, 4);

      ctx.strokeStyle = color || '#0284c7';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + width / 2, y + 4);
      ctx.lineTo(x + width / 2, y + height - 4);
      ctx.stroke();
    } else {
      ctx.fillRect(x, y, 4, height);
      ctx.fillRect(x + width - 4, y, 4, height);
      if (width > 90) ctx.fillRect(x + width / 2 - 2, y, 4, height);

      ctx.strokeStyle = color || '#0284c7';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + height / 2);
      ctx.lineTo(x + width - 4, y + height / 2);
      ctx.stroke();
    }

    ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = isSelected ? 2.5 : 1;
    ctx.strokeRect(x, y, width, height);

  } else {
    ctx.fillStyle = isSelected ? '#3b82f6' : (color || '#2c3050');
    ctx.fillRect(x, y, width, height);

    ctx.strokeStyle = isSelected ? '#60a5fa' : 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1;
    if (isVert) {
      for (let sy = y + 16; sy < y + height - 12; sy += 28) {
        ctx.beginPath(); ctx.moveTo(x, sy); ctx.lineTo(x + width, sy); ctx.stroke();
      }
    } else {
      for (let sx = x + 16; sx < x + width - 12; sx += 28) {
        ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx, y + height); ctx.stroke();
      }
    }
  }

  if (isSelected && !isGhost) {
    ctx.font = '600 9px Inter, sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.fillText(`${len}×${th}px`, x + width / 2, isVert ? y - 6 : y - 6);
  }

  ctx.restore();
}

// ─── 2. ARCHITECTURAL DOOR RENDERER ──────────────────────────────────────────
export function drawArchitecturalDoor(ctx, d, isGhost = false, isSelected = false, isOpen = false) {
  const {
    x, y, w: width, h: height,
    rotation = 0,
    variation = 'single_swing',
    color = '#78350f',
    arc,
  } = d;

  ctx.save();
  if (rotation && rotation !== 90 && rotation !== 180 && rotation !== 270) {
    const cx = x + width / 2;
    const cy = y + height / 2;
    ctx.translate(cx, cy);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }

  if (isGhost) ctx.globalAlpha = 0.75;
  const isVert = height > width;
  const leafLen = isVert ? height : width;

  if (variation === 'double_swing') {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);

    const half = (isVert ? height : width) / 2;

    ctx.fillStyle = '#f59e0b';
    if (isVert) {
      ctx.beginPath(); ctx.arc(x + width / 2, y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + width / 2, y + height, 3, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = color || '#78350f';
      ctx.fillRect(x - half + width, y, half, width);
      ctx.fillRect(x - half + width, y + half, half, width);

      ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(x + width / 2, y, half, 0, Math.PI / 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + width / 2, y + height, half, -Math.PI / 2, 0); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(x, y + height / 2, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + width, y + height / 2, 3, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = color || '#78350f';
      ctx.fillRect(x, y - half, height, half);
      ctx.fillRect(x + width - height, y - half, height, half);

      ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(x, y + height / 2, half, -Math.PI / 2, 0); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + width, y + height / 2, half, Math.PI, -Math.PI / 2); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.font = '600 9px Inter, sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.textAlign = 'center';
    ctx.fillText('[DOUBLE DOOR]', x + width / 2, isVert ? y + height / 2 : y - 8);

  } else if (variation === 'sliding_pocket') {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.fillRect(x, y, width, height);

    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, width, height);

    ctx.fillStyle = color || '#0284c7';
    if (isVert) {
      ctx.fillRect(x - 3, y + 4, width + 6, height - 8);
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 8px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('▲▼', x + width / 2, y + height / 2 + 3);
    } else {
      ctx.fillRect(x + 4, y - 3, width - 8, height + 6);
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 8px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('◄►', x + width / 2, y + height / 2 + 3);
    }
    ctx.font = '600 9px Inter, sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.fillText('[SLIDING]', x + width / 2, isVert ? y - 8 : y - 10);

  } else if (variation === 'glass_frameless') {
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);

    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.arc(x + 2, y + height / 2, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(56, 189, 248, 0.5)';
    if (isVert) {
      ctx.fillRect(x - leafLen + width, y, leafLen, width);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - leafLen + width + 8, y + 2, 3, width - 4);
    } else {
      ctx.fillRect(x, y - leafLen, height, leafLen);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 2, y - leafLen + 8, height - 4, 3);
    }

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 3]);
    if (arc) {
      ctx.beginPath();
      ctx.arc(arc[0], arc[1], arc[2] || leafLen, arc[3] || 0, arc[4] || Math.PI / 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.font = '600 9px Inter, sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.fillText('[GLASS DOOR]', x + width / 2, isVert ? y + height / 2 : y - 8);

  } else if (variation === 'modern_sound_lock') {
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);

    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(x + 2, y + height / 2, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color || '#1e293b';
    if (isVert) {
      ctx.fillRect(x - leafLen + width, y, leafLen, width);
    } else {
      ctx.fillRect(x, y - leafLen, height, leafLen);
    }

    ctx.strokeStyle = 'rgba(245, 158, 11, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    if (arc) {
      ctx.beginPath();
      ctx.arc(arc[0], arc[1], arc[2] || leafLen, arc[3] || 0, arc[4] || Math.PI / 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.font = '700 9px Inter, sans-serif';
    ctx.fillStyle = '#f59e0b';
    ctx.textAlign = 'center';
    ctx.fillText('[SOUND LOCK]', x + width / 2, isVert ? y + height / 2 : y - 8);

  } else {
    ctx.fillStyle = color || '#78350f';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = isSelected ? '#38bdf8' : '#b45309';
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.strokeRect(x, y, width, height);

    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(x + 2, y + height / 2, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(234, 88, 12, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 3]);
    if (arc) {
      ctx.beginPath();
      ctx.arc(arc[0], arc[1], arc[2] || leafLen, arc[3] || 0, arc[4] || Math.PI / 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(x - 8, y - 8, width + 16, height + 16);
    }
    ctx.setLineDash([]);
    ctx.font = '600 10px Inter, sans-serif';
    ctx.fillStyle = '#d97706';
    ctx.textAlign = 'center';
    ctx.fillText('[DOOR]', x + width / 2, isVert ? y + height / 2 : y - 8);
  }

  if (isSelected && !isGhost) {
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 3, y - 3, width + 6, height + 6);
  }

  ctx.restore();
}

// ─── 3. ARCHITECTURAL ACOUSTIC ZONE RENDERER ─────────────────────────────────
export function drawArchitecturalZone(ctx, z, isGhost = false, isSelected = false) {
  const {
    bounds,
    name = 'Acoustic Zone',
    variation = 'meeting_suite',
    isIsolated = true,
  } = z;

  const zw = bounds.x2 - bounds.x1;
  const zh = bounds.y2 - bounds.y1;
  const x = bounds.x1;
  const y = bounds.y1;

  ctx.save();
  if (isGhost) ctx.globalAlpha = 0.75;

  if (variation === 'focus_pod') {
    ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
    ctx.fillRect(x, y, zw, zh);

    ctx.strokeStyle = isSelected ? '#10b981' : 'rgba(16, 185, 129, 0.45)';
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(x, y, zw, zh);
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(16, 185, 129, 0.4)';
    const cSize = 14;
    ctx.fillRect(x, y, cSize, cSize);
    ctx.fillRect(x + zw - cSize, y, cSize, cSize);
    ctx.fillRect(x, y + zh - cSize, cSize, cSize);
    ctx.fillRect(x + zw - cSize, y + zh - cSize, cSize, cSize);

    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillStyle = '#10b981';
    ctx.textAlign = 'center';
    ctx.fillText(`${name.toUpperCase()} · -85% BLEED`, x + zw / 2, y + 20);

  } else if (variation === 'boardroom_vault') {
    ctx.fillStyle = 'rgba(99, 102, 241, 0.10)';
    ctx.fillRect(x, y, zw, zh);

    ctx.strokeStyle = isSelected ? '#818cf8' : 'rgba(99, 102, 241, 0.55)';
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x, y, zw, zh);
    ctx.strokeRect(x + 5, y + 5, zw - 10, zh - 10);
    ctx.setLineDash([]);

    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = 2;
    const lLen = 18;
    ctx.beginPath(); ctx.moveTo(x, y + lLen); ctx.lineTo(x, y); ctx.lineTo(x + lLen, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + zw - lLen, y); ctx.lineTo(x + zw, y); ctx.lineTo(x + zw, y + lLen); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + zh - lLen); ctx.lineTo(x, y + zh); ctx.lineTo(x + lLen, y + zh); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + zw - lLen, y + zh); ctx.lineTo(x + zw, y + zh); ctx.lineTo(x + zw, y + zh - lLen); ctx.stroke();

    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillStyle = '#818cf8';
    ctx.textAlign = 'center';
    ctx.fillText(`${name.toUpperCase()} · SOUNDPROOF VAULT`, x + zw / 2, y + 22);

  } else {
    ctx.fillStyle = isIsolated ? 'rgba(56, 189, 248, 0.09)' : 'rgba(34, 197, 94, 0.08)';
    ctx.fillRect(x, y, zw, zh);

    ctx.strokeStyle = isSelected ? '#0284c7' : 'rgba(56, 189, 248, 0.5)';
    ctx.lineWidth = isSelected ? 3 : 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(x, y, zw, zh);
    ctx.setLineDash([]);

    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.5;
    const lLen = 14;
    ctx.beginPath(); ctx.moveTo(x, y + lLen); ctx.lineTo(x, y); ctx.lineTo(x + lLen, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + zw - lLen, y); ctx.lineTo(x + zw, y); ctx.lineTo(x + zw, y + lLen); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + zh - lLen); ctx.lineTo(x, y + zh); ctx.lineTo(x + lLen, y + zh); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + zw - lLen, y + zh); ctx.lineTo(x + zw, y + zh); ctx.lineTo(x + zw, y + zh - lLen); ctx.stroke();

    ctx.font = '600 11px Inter, sans-serif';
    ctx.fillStyle = '#0284c7';
    ctx.textAlign = 'center';
    ctx.fillText(`${name.toUpperCase()}`, x + zw / 2, y + 20);
  }

  ctx.font = '500 9px Inter, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'right';
  const approxM2 = Math.round((zw * zh) / 900);
  ctx.fillText(`${zw}×${zh} px (${approxM2} m²)`, x + zw - 8, y + zh - 8);

  ctx.restore();
}

// ─── 4. ARCHITECTURAL BOARDROOM TABLE RENDERER ───────────────────────────────
export function drawArchitecturalTable(ctx, f, isGhost = false, isSelected = false) {
  const {
    x, y, w = 320, h = 150,
    rotation = 0,
    variation = 'rectangular_executive',
    color = '#78350f',
    name = 'Boardroom Table',
  } = f;

  ctx.save();
  const cx = x + w / 2;
  const cy = y + h / 2;

  if (rotation) {
    ctx.translate(cx, cy);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }

  if (isGhost) ctx.globalAlpha = 0.75;

  // Table shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
  roundRect(ctx, x + 3, y + 5, w, h, variation === 'circular_round' ? w / 2 : 12);
  ctx.fill();

  if (variation === 'racetrack_oval') {
    // Racetrack capsule table
    const radius = Math.min(w, h) / 2;
    ctx.fillStyle = color || '#854d0e';
    roundRect(ctx, x, y, w, h, radius);
    ctx.fill();

    // Center contrasting inlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    roundRect(ctx, x + 30, y + 20, w - 60, h - 40, radius - 15);
    ctx.fill();

    // Inner bevel border
    ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    roundRect(ctx, x, y, w, h, radius);
    ctx.stroke();

    // Center cable raceway
    ctx.fillStyle = '#1e293b';
    roundRect(ctx, cx - 45, cy - 8, 90, 16, 4);
    ctx.fill();

    // Radial & perimeter chairs
    const chairCol = '#522e06';
    [-w * 0.32, -w * 0.11, w * 0.11, w * 0.32].forEach((ox) => {
      drawArchitecturalChair(ctx, cx + ox, y - 18, 0, 'leather', chairCol, isSelected);
      drawArchitecturalChair(ctx, cx + ox, y + h + 18, Math.PI, 'leather', chairCol, isSelected);
    });
    // Curved end chairs
    drawArchitecturalChair(ctx, x - 18, cy, -Math.PI / 2, 'leather', chairCol, isSelected);
    drawArchitecturalChair(ctx, x + w + 18, cy, Math.PI / 2, 'leather', chairCol, isSelected);

  } else if (variation === 'circular_round') {
    // Democratic Round Executive Roundtable
    const r = w / 2;
    ctx.fillStyle = color || '#92400e';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Outer beveled ring
    ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Center revolving turntable (lazy susan) & power hub
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.38, 0, Math.PI * 2);
    ctx.stroke();

    // 8 radially arranged executive chairs
    const chairCount = 8;
    const chairCol = '#451a03';
    for (let i = 0; i < chairCount; i++) {
      const angle = (i * 2 * Math.PI) / chairCount;
      const chX = cx + (r + 20) * Math.cos(angle);
      const chY = cy + (r + 20) * Math.sin(angle);
      drawArchitecturalChair(ctx, chX, chY, angle + Math.PI / 2, 'leather', chairCol, isSelected);
    }

  } else if (variation === 'modular_u_shape') {
    // Video Conference U-Shape Table
    const wingW = Math.max(48, Math.round(w * 0.22));
    const backH = Math.max(44, Math.round(h * 0.24));

    ctx.fillStyle = color || '#334155';
    // Left Wing
    roundRect(ctx, x, y, wingW, h, 6);
    ctx.fill();
    // Right Wing
    roundRect(ctx, x + w - wingW, y, wingW, h, 6);
    ctx.fill();
    // Base Header (closing the U)
    roundRect(ctx, x, y + h - backH, w, backH, 6);
    ctx.fill();

    // Tabletop borders
    ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    roundRect(ctx, x, y, wingW, h, 6); ctx.stroke();
    roundRect(ctx, x + w - wingW, y, wingW, h, 6); ctx.stroke();
    roundRect(ctx, x, y + h - backH, w, backH, 6); ctx.stroke();

    // Presentation view label inside open center
    ctx.font = '600 10px Inter, sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.fillText('▲ AV PRESENTATION SIGHTLINE', cx, cy - 10);

    // Chairs along the outer wings and base
    const chairCol = '#1e293b';
    // Left wing outer chairs
    drawArchitecturalChair(ctx, x - 18, y + h * 0.25, -Math.PI / 2, 'leather', chairCol, isSelected);
    drawArchitecturalChair(ctx, x - 18, y + h * 0.65, -Math.PI / 2, 'leather', chairCol, isSelected);
    // Right wing outer chairs
    drawArchitecturalChair(ctx, x + w + 18, y + h * 0.25, Math.PI / 2, 'leather', chairCol, isSelected);
    drawArchitecturalChair(ctx, x + w + 18, y + h * 0.65, Math.PI / 2, 'leather', chairCol, isSelected);
    // Bottom base chairs
    drawArchitecturalChair(ctx, cx - 60, y + h + 18, Math.PI, 'leather', chairCol, isSelected);
    drawArchitecturalChair(ctx, cx + 60, y + h + 18, Math.PI, 'leather', chairCol, isSelected);

  } else if (variation === 'glass_minimalist') {
    // Frosted Glass Table with stainless chrome perimeter
    ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();

    // Chrome perimeter truss
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2.5;
    roundRect(ctx, x, y, w, h, 8);
    ctx.stroke();

    // Inner glass bevel
    ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1;
    roundRect(ctx, x + 6, y + 6, w - 12, h - 12, 6);
    ctx.stroke();

    // 4 Corner structural truss leg posts
    ctx.fillStyle = '#cbd5e1';
    roundRect(ctx, x + 8, y + 8, 12, 12, 3); ctx.fill();
    roundRect(ctx, x + w - 20, y + 8, 12, 12, 3); ctx.fill();
    roundRect(ctx, x + 8, y + h - 20, 12, 12, 3); ctx.fill();
    roundRect(ctx, x + w - 20, y + h - 20, 12, 12, 3); ctx.fill();

    // Cantilevered mesh chairs
    const chairCol = '#0284c7';
    [-w * 0.32, -w * 0.11, w * 0.11, w * 0.32].forEach((ox) => {
      drawArchitecturalChair(ctx, cx + ox, y - 18, 0, 'mesh', chairCol, isSelected);
      drawArchitecturalChair(ctx, cx + ox, y + h + 18, Math.PI, 'mesh', chairCol, isSelected);
    });

  } else {
    // Executive Mahogany Boardroom (default)
    ctx.fillStyle = color || '#78350f';
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();

    // Wood beveled inner frame
    ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    roundRect(ctx, x, y, w, h, 10);
    ctx.stroke();

    // Center recessed cable raceway & popup power module
    ctx.fillStyle = '#1e293b';
    roundRect(ctx, cx - w * 0.25, cy - 10, w * 0.5, 20, 4);
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    roundRect(ctx, cx - w * 0.25, cy - 10, w * 0.5, 20, 4);
    ctx.stroke();

    // Power outlets inside raceway
    ctx.fillStyle = '#38bdf8';
    [-40, 0, 40].forEach((ox) => {
      ctx.fillRect(cx + ox - 4, cy - 3, 8, 6);
    });

    // 10 Executive Armchairs (4 top, 4 bottom, 1 left, 1 right)
    const chairCol = '#451a03';
    [-w * 0.32, -w * 0.11, w * 0.11, w * 0.32].forEach((ox) => {
      drawArchitecturalChair(ctx, cx + ox, y - 18, 0, 'leather', chairCol, isSelected);
      drawArchitecturalChair(ctx, cx + ox, y + h + 18, Math.PI, 'leather', chairCol, isSelected);
    });
    drawArchitecturalChair(ctx, x - 18, cy, -Math.PI / 2, 'leather', chairCol, isSelected);
    drawArchitecturalChair(ctx, x + w + 18, cy, Math.PI / 2, 'leather', chairCol, isSelected);
  }

  // Label when selected or in studio
  ctx.font = '600 10px Inter, sans-serif';
  ctx.fillStyle = isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.8)';
  ctx.textAlign = 'center';
  ctx.fillText(name.toUpperCase(), cx, cy + 3);

  ctx.restore();
}

// ─── 5. ARCHITECTURAL WORKSTATION POD RENDERER ───────────────────────────────
export function drawArchitecturalDesk(ctx, f, isGhost = false, isSelected = false) {
  const {
    x, y, w = 180, h = 100,
    rotation = 0,
    variation = 'dual_bench',
    color = '#cbd5e1',
    name = 'Workstation Pod',
  } = f;

  ctx.save();
  const cx = x + w / 2;
  const cy = y + h / 2;

  if (rotation) {
    ctx.translate(cx, cy);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }

  if (isGhost) ctx.globalAlpha = 0.75;

  // Cast shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
  roundRect(ctx, x + 2, y + 4, w, h, 8);
  ctx.fill();

  if (variation === 'executive_l_desk') {
    // Private Executive L-Desk Suite
    const mainH = Math.round(h * 0.58);
    const sideW = Math.round(w * 0.35);

    // Main desk
    ctx.fillStyle = color || '#78350f';
    roundRect(ctx, x, y, w, mainH, 6);
    ctx.fill();

    // Side credenza return
    ctx.fillStyle = '#522e06';
    roundRect(ctx, x + w - sideW, y + mainH - 2, sideW, h - mainH + 2, 6);
    ctx.fill();

    // Outer borders
    ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(0, 0, 0, 0.2)';
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    roundRect(ctx, x, y, w, mainH, 6); ctx.stroke();
    roundRect(ctx, x + w - sideW, y + mainH - 2, sideW, h - mainH + 2, 6); ctx.stroke();

    // Executive Desk Blotter Mat
    ctx.fillStyle = '#1e293b';
    roundRect(ctx, x + 35, y + 14, 80, 40, 4);
    ctx.fill();

    // Dual monitor on articulating arm
    drawArchitecturalMonitor(ctx, x + 60, y + 8, -0.15, '#38bdf8');
    drawArchitecturalMonitor(ctx, x + 95, y + 8, 0.15, '#38bdf8');

    // High-back Executive Chair (behind desk)
    drawArchitecturalChair(ctx, x + 75, y - 20, 0, 'leather', '#451a03', isSelected);

    // 2 Visitor Guest Chairs (in front of desk)
    drawArchitecturalChair(ctx, x + 40, y + h + 18, Math.PI, 'leather', '#854d0e', isSelected);
    drawArchitecturalChair(ctx, x + 110, y + h + 18, Math.PI, 'leather', '#854d0e', isSelected);

  } else if (variation === 'quad_cluster') {
    // 4-Person Agile Team Quad Pod
    ctx.fillStyle = color || '#334155';
    roundRect(ctx, x, y, w, h, 6);
    ctx.fill();

    // Outer border
    ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    roundRect(ctx, x, y, w, h, 6);
    ctx.stroke();

    // Cruciform Acoustic Fabric Dividers (cross partition)
    ctx.fillStyle = '#0ea5e9';
    // Horizontal acoustic screen
    roundRect(ctx, x + 6, cy - 3, w - 12, 6, 2);
    ctx.fill();
    // Vertical acoustic screen
    roundRect(ctx, cx - 3, y + 6, 6, h - 12, 2);
    ctx.fill();

    // 4 Workstation Monitors & Chairs
    const qx1 = x + (cx - x) / 2;
    const qx2 = cx + (x + w - cx) / 2;
    const qy1 = y + (cy - y) / 2;
    const qy2 = cy + (y + h - cy) / 2;

    // Top-left and Top-right
    drawArchitecturalMonitor(ctx, qx1, cy - 14, Math.PI, '#38bdf8');
    drawArchitecturalChair(ctx, qx1, y - 18, 0, 'mesh', '#1e293b', isSelected);
    drawArchitecturalMonitor(ctx, qx2, cy - 14, Math.PI, '#38bdf8');
    drawArchitecturalChair(ctx, qx2, y - 18, 0, 'mesh', '#1e293b', isSelected);

    // Bottom-left and Bottom-right
    drawArchitecturalMonitor(ctx, qx1, cy + 14, 0, '#38bdf8');
    drawArchitecturalChair(ctx, qx1, y + h + 18, Math.PI, 'mesh', '#1e293b', isSelected);
    drawArchitecturalMonitor(ctx, qx2, cy + 14, 0, '#38bdf8');
    drawArchitecturalChair(ctx, qx2, y + h + 18, Math.PI, 'mesh', '#1e293b', isSelected);

  } else if (variation === 'standing_desk_cluster') {
    // Motorized Height-Adjustable Standing Desk
    ctx.fillStyle = color || '#b45309';
    roundRect(ctx, x, y, w, h, 6);
    ctx.fill();

    ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    roundRect(ctx, x, y, w, h, 6);
    ctx.stroke();

    // Digital controller on right edge
    ctx.fillStyle = '#0f172a';
    roundRect(ctx, x + w - 24, y + 6, 18, 8, 2);
    ctx.fill();
    ctx.fillStyle = '#22c55e';
    ctx.font = '700 6px monospace';
    ctx.fillText('72cm', x + w - 21, y + 12);

    // Dual display on heavy-duty clamp arm
    drawArchitecturalMonitor(ctx, cx - 22, y + 14, -0.1, '#38bdf8');
    drawArchitecturalMonitor(ctx, cx + 22, y + 14, 0.1, '#38bdf8');

    // Laptop & keyboard mat
    ctx.fillStyle = '#334155';
    roundRect(ctx, cx - 35, y + 36, 70, 24, 3);
    ctx.fill();

    // Ergonomic task chair
    drawArchitecturalChair(ctx, cx, y + h + 20, Math.PI, 'mesh', '#1e293b', isSelected);

  } else {
    // Dual Collaborative Workstation Bench (default)
    ctx.fillStyle = color || '#cbd5e1';
    roundRect(ctx, x, y, w, h, 6);
    ctx.fill();

    ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(0, 0, 0, 0.18)';
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    roundRect(ctx, x, y, w, h, 6);
    ctx.stroke();

    // Central Fabric Acoustic Privacy Partition Screen
    ctx.fillStyle = '#0284c7';
    roundRect(ctx, x + 4, cy - 3.5, w - 8, 7, 2.5);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    roundRect(ctx, x + 4, cy - 3.5, w - 8, 7, 2.5);
    ctx.stroke();

    // Top Workstation setup
    const offsetW = w * 0.25;
    drawArchitecturalMonitor(ctx, cx - offsetW, cy - 14, Math.PI, '#38bdf8');
    drawArchitecturalMonitor(ctx, cx + offsetW, cy - 14, Math.PI, '#38bdf8');
    drawArchitecturalChair(ctx, cx - offsetW, y - 18, 0, 'mesh', '#334155', isSelected);
    drawArchitecturalChair(ctx, cx + offsetW, y - 18, 0, 'mesh', '#334155', isSelected);

    // Bottom Workstation setup
    drawArchitecturalMonitor(ctx, cx - offsetW, cy + 14, 0, '#38bdf8');
    drawArchitecturalMonitor(ctx, cx + offsetW, cy + 14, 0, '#38bdf8');
    drawArchitecturalChair(ctx, cx - offsetW, y + h + 18, Math.PI, 'mesh', '#334155', isSelected);
    drawArchitecturalChair(ctx, cx + offsetW, y + h + 18, Math.PI, 'mesh', '#334155', isSelected);
  }

  ctx.restore();
}

// ─── 6. ARCHITECTURAL LOUNGE SOFA RENDERER ───────────────────────────────────
export function drawArchitecturalSofa(ctx, f, isGhost = false, isSelected = false) {
  const {
    x, y, w = 180, h = 75,
    rotation = 0,
    variation = 'linear_cushioned',
    color = '#334155',
    name = 'Lounge Sofa',
  } = f;

  ctx.save();
  const cx = x + w / 2;
  const cy = y + h / 2;

  if (rotation) {
    ctx.translate(cx, cy);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }

  if (isGhost) ctx.globalAlpha = 0.75;

  // Soft shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
  roundRect(ctx, x + 2, y + 4, w, h, 8);
  ctx.fill();

  if (variation === 'l_sectional') {
    // L-Shaped Corner Modular Sectional
    const backTh = 16;
    const armTh = 14;
    const chaiseW = Math.round(w * 0.42);

    ctx.fillStyle = color || '#1e293b';
    // Main horizontal run
    roundRect(ctx, x, y, w, h * 0.65, 8);
    ctx.fill();
    // Vertical chaise return
    roundRect(ctx, x, y, chaiseW, h, 8);
    ctx.fill();

    // Padded backrest along top & left
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    roundRect(ctx, x, y, w, backTh, 4); ctx.fill();
    roundRect(ctx, x, y, armTh, h, 4); ctx.fill();

    // Outer border
    ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    roundRect(ctx, x, y, w, h * 0.65, 8); ctx.stroke();
    roundRect(ctx, x, y, chaiseW, h, 8); ctx.stroke();

    // Integrated oak coffee table ledge
    ctx.fillStyle = '#854d0e';
    roundRect(ctx, x + w - 30, y + 8, 24, 24, 3);
    ctx.fill();

  } else if (variation === 'curved_banquette') {
    // Semi-Circular Huddle Banquette with Low Round Coffee Table
    const r = Math.min(w, h * 1.4) / 2;
    ctx.fillStyle = color || '#0f766e';
    ctx.beginPath();
    ctx.arc(cx, cy + 10, r, Math.PI, 0, false);
    ctx.lineWidth = 32;
    ctx.strokeStyle = color || '#0f766e';
    ctx.stroke();

    // Fluted backrest ribs
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 1.5;
    for (let a = Math.PI + 0.2; a < 2 * Math.PI - 0.2; a += 0.35) {
      const rx1 = cx + (r - 16) * Math.cos(a);
      const ry1 = cy + 10 + (r - 16) * Math.sin(a);
      const rx2 = cx + (r + 16) * Math.cos(a);
      const ry2 = cy + 10 + (r + 16) * Math.sin(a);
      ctx.beginPath(); ctx.moveTo(rx1, ry1); ctx.lineTo(rx2, ry2); ctx.stroke();
    }

    // Central circular low oak coffee table
    ctx.fillStyle = '#854d0e';
    ctx.beginPath();
    ctx.arc(cx, cy + 10, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = isSelected ? '#38bdf8' : '#a16207';
    ctx.lineWidth = 1.5;
    ctx.stroke();

  } else if (variation === 'accent_armchairs_set') {
    // Duo of Accent Armchairs + Oblong Coffee Table
    const chairCol = color || '#9a3412';
    drawArchitecturalChair(ctx, x + 35, cy, Math.PI * 0.15, 'leather', chairCol, isSelected);
    drawArchitecturalChair(ctx, x + w - 35, cy, -Math.PI * 0.15, 'leather', chairCol, isSelected);

    // Central low oblong coffee table
    ctx.fillStyle = '#cbd5e1';
    roundRect(ctx, cx - 28, cy - 14, 56, 28, 8);
    ctx.fill();
    ctx.strokeStyle = isSelected ? '#38bdf8' : '#64748b';
    ctx.lineWidth = 1.5;
    roundRect(ctx, cx - 28, cy - 14, 56, 28, 8);
    ctx.stroke();

  } else {
    // 3-Seater Linear Executive Sofa (default)
    const armW = 16;
    const backH = 18;

    ctx.fillStyle = color || '#334155';
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();

    // Padded backrest
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    roundRect(ctx, x, y, w, backH, 4);
    ctx.fill();

    // Padded left and right armrests
    roundRect(ctx, x, y, armW, h, 4);
    ctx.fill();
    roundRect(ctx, x + w - armW, y, armW, h, 4);
    ctx.fill();

    // 3 Distinct Seat Cushions
    const seatW = (w - armW * 2 - 8) / 3;
    const seatH = h - backH - 6;
    ctx.fillStyle = color || '#334155';
    for (let i = 0; i < 3; i++) {
      const sx = x + armW + 4 + i * (seatW + 2);
      const sy = y + backH + 2;
      roundRect(ctx, sx, sy, seatW, seatH, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.lineWidth = 1;
      roundRect(ctx, sx, sy, seatW, seatH, 4);
      ctx.stroke();
    }

    // 2 Decorative throw pillows on corners
    ctx.fillStyle = '#0ea5e9';
    roundRect(ctx, x + armW + 2, y + backH + 4, 18, 14, 3);
    ctx.fill();
    roundRect(ctx, x + w - armW - 20, y + backH + 4, 18, 14, 3);
    ctx.fill();

    // Sofa outer outline
    ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    roundRect(ctx, x, y, w, h, 8);
    ctx.stroke();
  }

  ctx.restore();
}

// ─── 7. ARCHITECTURAL IT SERVER RACK RENDERER ────────────────────────────────
export function drawArchitecturalServerRack(ctx, f, isGhost = false, isSelected = false) {
  const {
    x, y, w = 75, h = 120,
    rotation = 0,
    variation = 'enterprise_rack',
    color = '#0f172a',
    name = 'IT Server Rack',
  } = f;

  ctx.save();
  const cx = x + w / 2;
  const cy = y + h / 2;

  if (rotation) {
    ctx.translate(cx, cy);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }

  if (isGhost) ctx.globalAlpha = 0.75;

  // Heavy steel cabinet housing
  ctx.fillStyle = color || '#0f172a';
  roundRect(ctx, x, y, w, h, 4);
  ctx.fill();

  ctx.strokeStyle = isSelected ? '#38bdf8' : '#334155';
  ctx.lineWidth = isSelected ? 2.5 : 1.5;
  roundRect(ctx, x, y, w, h, 4);
  ctx.stroke();

  if (variation === 'blade_chassis') {
    // High-Density Blade Enclosure with Horizontal Blades & Fan Banks
    ctx.fillStyle = '#1e293b';
    roundRect(ctx, x + 6, y + 6, w - 12, h - 12, 3);
    ctx.fill();

    // Dual intake fans at bottom
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(x + 22, y + h - 22, 12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w - 22, y + h - 22, 12, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0284c7'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x + 22, y + h - 22, 12, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + w - 22, y + h - 22, 12, 0, Math.PI * 2); ctx.stroke();

    // Blade server slots
    for (let by = y + 14; by < y + h - 42; by += 16) {
      ctx.fillStyle = '#334155';
      ctx.fillRect(x + 10, by, w - 20, 10);
      // Status LEDs on blade
      ctx.fillStyle = '#22c55e'; ctx.fillRect(x + 14, by + 3, 4, 4);
      ctx.fillStyle = '#38bdf8'; ctx.fillRect(x + 22, by + 3, 4, 4);
    }

  } else if (variation === 'open_frame_lab') {
    // 4-Post Open Frame Lab Rack with Patch Bays
    ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
    ctx.fillRect(x, y, w, h);

    // 4 Heavy Corner Corner Posts
    ctx.fillStyle = '#64748b';
    ctx.fillRect(x, y, 10, 10);
    ctx.fillRect(x + w - 10, y, 10, 10);
    ctx.fillRect(x, y + h - 10, 10, 10);
    ctx.fillRect(x + w - 10, y + h - 10, 10, 10);

    // Patch bays
    for (let py = y + 16; py < y + h - 16; py += 18) {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x + 8, py, w - 16, 12);
      ctx.strokeStyle = '#854d0e';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 8, py, w - 16, 12);
      // RJ45 jack array
      ctx.fillStyle = '#e2e8f0';
      for (let jx = x + 14; jx < x + w - 16; jx += 9) {
        ctx.fillRect(jx, py + 3, 5, 5);
      }
    }

  } else {
    // 42U Enterprise Enclosed Cabinet (default)
    // Perforated mesh ventilation louvers
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.2;
    for (let ly = y + 26; ly < y + h - 12; ly += 9) {
      ctx.beginPath();
      ctx.moveTo(x + 8, ly);
      ctx.lineTo(x + w - 8, ly);
      ctx.stroke();
    }

    // Telemetry Diagnostic Status LEDs
    ctx.fillStyle = '#10b981'; // Green active power
    ctx.beginPath(); ctx.arc(x + 14, y + 12, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#38bdf8'; // Cyan network transmit
    ctx.beginPath(); ctx.arc(x + 26, y + 12, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f59e0b'; // Amber storage heartbeat
    ctx.beginPath(); ctx.arc(x + 38, y + 12, 3.5, 0, Math.PI * 2); ctx.fill();
  }

  // Unit badge
  ctx.font = '700 8px Inter, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'right';
  ctx.fillText('42U RACK', x + w - 8, y + h - 6);

  ctx.restore();
}

// ─── 8. ARCHITECTURAL BIOPHILIC PLANT RENDERER ───────────────────────────────
export function drawArchitecturalPlant(ctx, f, isGhost = false, isSelected = false) {
  const {
    x, y, r = 22, w = 140, h = 36,
    rotation = 0,
    variation = 'monstera_deliciosa',
    color = '#22c55e',
    name = 'Indoor Plant',
  } = f;

  ctx.save();
  if (isGhost) ctx.globalAlpha = 0.75;

  if (variation === 'planter_partition_box') {
    // Rectangular Biophilic Acoustic Planter Divider Box
    const cx = x + w / 2;
    const cy = y + h / 2;

    if (rotation) {
      ctx.translate(cx, cy);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    // Modern architectural trough planter
    ctx.fillStyle = '#1e293b';
    roundRect(ctx, x, y, w, h, 5);
    ctx.fill();

    ctx.strokeStyle = isSelected ? '#38bdf8' : '#334155';
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    roundRect(ctx, x, y, w, h, 5);
    ctx.stroke();

    // Dark potting soil bed
    ctx.fillStyle = '#451a03';
    roundRect(ctx, x + 4, y + 4, w - 8, h - 8, 3);
    ctx.fill();

    // Dense organic foliage bushes
    const bushColors = [color || '#15803d', '#22c55e', '#16a34a', '#4ade80'];
    for (let bx = x + 12; bx < x + w - 6; bx += 14) {
      const bRad = 10 + ((bx * 7) % 5);
      ctx.fillStyle = bushColors[Math.abs(bx) % bushColors.length];
      ctx.beginPath();
      ctx.arc(bx, cy, bRad, 0, Math.PI * 2);
      ctx.fill();
    }

  } else if (variation === 'ficus_lyrata') {
    // Fiddle-Leaf Fig in Ceramic Cylinder Pot
    if (rotation) {
      ctx.translate(x, y);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-x, -y);
    }

    // Ceramic pot base
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath(); ctx.arc(x, y, r * 0.75, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = isSelected ? '#38bdf8' : '#cbd5e1';
    ctx.lineWidth = isSelected ? 2.5 : 1.5; ctx.stroke();

    // Soil
    ctx.fillStyle = '#451a03';
    ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, Math.PI * 2); ctx.fill();

    // Broad violin-shaped leaves radiating
    const leafCount = 6;
    for (let i = 0; i < leafCount; i++) {
      const angle = (i * 2 * Math.PI) / leafCount;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = color || '#16a34a';
      ctx.beginPath();
      ctx.ellipse(r * 0.8, 0, r * 0.75, r * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

  } else {
    // Monstera Deliciosa with Split Leaves (default)
    if (rotation) {
      ctx.translate(x, y);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-x, -y);
    }

    // Terracotta pot with rim
    ctx.fillStyle = '#c2410c';
    ctx.beginPath(); ctx.arc(x, y, r * 0.72, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = isSelected ? '#38bdf8' : '#7c2d12';
    ctx.lineWidth = isSelected ? 2.5 : 2; ctx.stroke();

    // Rich potting soil
    ctx.fillStyle = '#3e2723';
    ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, Math.PI * 2); ctx.fill();

    // Organic Monstera Leaves
    const leafAngles = [0, 0.75, 1.45, 2.2, 3.0, 3.8, 4.6, 5.4];
    leafAngles.forEach((a, idx) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);

      ctx.fillStyle = idx % 2 === 0 ? (color || '#22c55e') : '#15803d';
      ctx.beginPath();
      ctx.ellipse(r * 0.85, 0, r * 0.8, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();

      // Leaf rib
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(r * 1.5, 0); ctx.stroke();

      ctx.restore();
    });
  }

  ctx.restore();
}

// ─── 9. ARCHITECTURAL SPAWN ARRIVAL POINT RENDERER ───────────────────────────
export function drawArchitecturalSpawn(ctx, spawn, isGhost = false, isSelected = false) {
  const {
    x, y,
    variation = 'executive_carpet',
    color = '#3b82f6',
  } = spawn;

  ctx.save();
  if (isGhost) ctx.globalAlpha = 0.75;

  if (variation === 'spatial_compass') {
    // Technical Spatial Audio Radar Rose
    ctx.strokeStyle = color || '#0284c7';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(x, y, 40, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);

    // Cardinal Axes
    ctx.strokeStyle = 'rgba(2, 132, 199, 0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x - 48, y); ctx.lineTo(x + 48, y);
    ctx.moveTo(x, y - 48); ctx.lineTo(x, y + 48);
    ctx.stroke();

    // Cardinal letters
    ctx.font = '700 9px monospace';
    ctx.fillStyle = '#0284c7';
    ctx.textAlign = 'center';
    ctx.fillText('N', x, y - 52);
    ctx.fillText('S', x, y + 60);
    ctx.fillText('W', x - 56, y + 3);
    ctx.fillText('E', x + 56, y + 3);

    // Center locator beacon
    ctx.fillStyle = isSelected ? '#38bdf8' : '#0284c7';
    ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();

  } else {
    // Executive Arrival Runner Rug with Brass Tabs (default)
    const rw = 80;
    const rh = 60;
    ctx.fillStyle = 'rgba(59, 130, 246, 0.18)';
    roundRect(ctx, x - rw / 2, y - rh / 2, rw, rh, 6);
    ctx.fill();

    // Woven perimeter border
    ctx.strokeStyle = isSelected ? '#38bdf8' : (color || '#3b82f6');
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    roundRect(ctx, x - rw / 2, y - rh / 2, rw, rh, 6);
    ctx.stroke();

    // Brass corner tabs
    ctx.fillStyle = '#fbbf24';
    [-rw / 2, rw / 2 - 6].forEach((cx) => {
      [-rh / 2, rh / 2 - 6].forEach((cy) => {
        ctx.fillRect(x + cx, y + cy, 6, 6);
      });
    });

    // Glowing center beacon target
    ctx.fillStyle = '#2563eb';
    ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
  }

  ctx.font = '700 10px Inter, sans-serif';
  ctx.fillStyle = isSelected ? '#38bdf8' : '#1d4ed8';
  ctx.textAlign = 'center';
  ctx.fillText('ARRIVAL POINT', x, y + 32);

  ctx.restore();
}

// ─── 10. UNIFIED FURNITURE DISPATCHER ─────────────────────────────────────────
export function drawArchitecturalFurniture(ctx, f, isGhost = false, isSelected = false) {
  const fType = f.furnitureType || f.type;

  if (fType === 'conf_table' || fType === 'table') {
    drawArchitecturalTable(ctx, f, isGhost, isSelected);
  } else if (fType === 'desk') {
    drawArchitecturalDesk(ctx, f, isGhost, isSelected);
  } else if (fType === 'sofa') {
    drawArchitecturalSofa(ctx, f, isGhost, isSelected);
  } else if (fType === 'server_rack') {
    drawArchitecturalServerRack(ctx, f, isGhost, isSelected);
  } else if (fType === 'plant') {
    drawArchitecturalPlant(ctx, f, isGhost, isSelected);
  } else if (fType === 'rect') {
    // Legacy generic table / desk fallback
    ctx.save();
    if (f.rotation) {
      const cx = f.x + (f.w || 0) / 2;
      const cy = f.y + (f.h || 0) / 2;
      ctx.translate(cx, cy);
      ctx.rotate((f.rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }
    ctx.fillStyle = f.color || '#b5896a';
    if (f.rx) {
      roundRect(ctx, f.x, f.y, f.w, f.h, f.rx);
      ctx.fill();
    } else {
      ctx.fillRect(f.x, f.y, f.w, f.h);
    }
    ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(0,0,0,0.18)';
    ctx.lineWidth = isSelected ? 2.5 : 1;
    ctx.strokeRect(f.x, f.y, f.w, f.h);
    ctx.restore();
  } else if (fType === 'chair') {
    drawArchitecturalChair(ctx, f.x, f.y, f.rotation || 0, 'leather', f.color || '#7c6050', isSelected);
  } else if (fType === 'screen') {
    drawArchitecturalMonitor(ctx, f.x, f.y, f.rotation || 0);
  }
}
