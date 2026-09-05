(() => {
  'use strict';

  const canvas = document.querySelector('#radar-canvas');
  const stage = document.querySelector('.preview-stage');
  const context = canvas.getContext('2d', { alpha: true });
  const theme = document.body.dataset.theme || 'lightwell';
  const countElement = document.querySelector('.stage-counter b');
  const stateButtons = [...document.querySelectorAll('.state-button')];

  const statePalettes = {
    alert: {
      core: [255, 247, 176],
      inner: [249, 203, 83],
      edge: [66, 191, 192],
      hot: [255, 126, 116],
      label: '警戒',
      speed: 0.72,
    },
    angry: {
      core: [255, 230, 180],
      inner: [255, 102, 80],
      edge: [214, 64, 110],
      hot: [255, 188, 70],
      label: '愤怒',
      speed: 1.04,
    },
    excited: {
      core: [225, 255, 239],
      inner: [75, 224, 176],
      edge: [194, 76, 211],
      hot: [90, 207, 241],
      label: '兴奋',
      speed: 0.9,
    },
  };

  const playerNames = [
    '夏日倾情', '小猫苗笙', '山海有信', '雾岛来信', '夜航星',
    '晚风与金克丝', '灯下的锤石', '北境不退', '月落潮汐', 'Koi',
    '只玩辅助', '玻璃海岸', '听见星光', '云上峡谷', '白昼梦游',
    '海盐汽水', '蓝色回声', '凌晨四点', '风从野区来', '银河漫游者',
  ];
  const iconIds = [
    29, 3151, 3366, 3547, 5091, 5425, 5465, 588, 7, 23,
    3543, 4067, 5030, 5188, 5410, 5582, 5654, 5782, 5886, 6035,
  ];
  const primaryLabelIndices = new Set([0, 1, 2, 3, 4]);
  const secondaryLabelIndices = new Set([7, 10, 13, 16, 19]);

  const players = playerNames.map((name, index) => ({
    name,
    iconId: iconIds[index],
    image: null,
    ready: false,
    phase: (index * 0.773) % (Math.PI * 2),
    ring: index < 7 ? 0 : index < 14 ? 1 : 2,
    angle: (index * 2.39996 + (index % 3) * 0.19) % (Math.PI * 2),
    size: index < 5 ? 20 : index < 13 ? 15 : 11,
    revealAt: 420 + index * 390,
    importance: primaryLabelIndices.has(index) ? 2 : secondaryLabelIndices.has(index) ? 1 : 0,
  }));

  for (const player of players) {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      player.ready = true;
    };
    image.onerror = () => {
      player.ready = false;
    };
    image.src = `https://game.gtimg.cn/images/lol/act/img/profileicon/${player.iconId}.png`;
    player.image = image;
  }

  let width = 0;
  let height = 0;
  let ratio = 1;
  let startedAt = performance.now();
  let activeState = 'alert';
  let pointerX = 0;
  let pointerY = 0;
  let targetPointerX = 0;
  let targetPointerY = 0;
  let paperPattern = null;

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const mix = (start, end, amount) => start + (end - start) * amount;
  const smoothstep = (minimum, maximum, value) => {
    const amount = clamp((value - minimum) / (maximum - minimum), 0, 1);
    return amount * amount * (3 - 2 * amount);
  };
  const rgba = (color, alpha) => `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;

  function resize() {
    const bounds = stage.getBoundingClientRect();
    width = Math.max(1, Math.round(bounds.width));
    height = Math.max(1, Math.round(bounds.height));
    ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    paperPattern = createPaperPattern();
  }

  function createPaperPattern() {
    const texture = document.createElement('canvas');
    texture.width = 160;
    texture.height = 160;
    const textureContext = texture.getContext('2d');
    textureContext.clearRect(0, 0, 160, 160);

    let seed = 918273;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let index = 0; index < 170; index += 1) {
      const x = random() * 160;
      const y = random() * 160;
      const length = 2 + random() * 13;
      const angle = (random() - 0.5) * 0.5;
      textureContext.beginPath();
      textureContext.moveTo(x, y);
      textureContext.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
      textureContext.strokeStyle = random() > 0.55
        ? `rgba(99, 83, 61, ${0.018 + random() * 0.022})`
        : `rgba(255, 255, 255, ${0.08 + random() * 0.08})`;
      textureContext.lineWidth = 0.45 + random() * 0.55;
      textureContext.stroke();
    }
    return context.createPattern(texture, 'repeat');
  }

  function drawLightwellBackground(centerX, centerY, time, palette) {
    context.fillStyle = '#f8faf9';
    context.fillRect(0, 0, width, height);

    const field = context.createRadialGradient(centerX, centerY, 34, centerX, centerY, Math.max(width, height) * 0.49);
    field.addColorStop(0, rgba(palette.edge, 0.09));
    field.addColorStop(0.2, 'rgba(220, 234, 235, 0.20)');
    field.addColorStop(0.52, 'rgba(233, 239, 239, 0.28)');
    field.addColorStop(1, 'rgba(248, 250, 249, 0)');
    context.fillStyle = field;
    context.fillRect(0, 0, width, height);

    const horizon = centerY + Math.min(102, height * 0.18);
    context.save();
    context.lineWidth = 0.7;
    for (let row = 0; row < 14; row += 1) {
      const progress = row / 13;
      const y = horizon + Math.pow(progress, 1.7) * (height - horizon + 80);
      context.beginPath();
      for (let x = -30; x <= width + 30; x += 14) {
        const distance = Math.abs(x - centerX) / Math.max(width, 1);
        const bend = Math.exp(-distance * 5.4) * Math.sin(time * 0.32 + progress * 2.2) * (10 + progress * 22);
        const nextY = y + bend * (1 - progress * 0.5);
        if (x === -30) context.moveTo(x, nextY);
        else context.lineTo(x, nextY);
      }
      context.strokeStyle = `rgba(75, 113, 120, ${0.032 + progress * 0.026})`;
      context.stroke();
    }
    for (let column = -10; column <= 10; column += 1) {
      const topX = centerX + column * 28;
      const bottomX = centerX + column * 86;
      context.beginPath();
      context.moveTo(topX, horizon - 4);
      context.quadraticCurveTo(centerX + column * 44, horizon + height * 0.24, bottomX, height + 40);
      context.strokeStyle = 'rgba(71, 108, 115, 0.045)';
      context.stroke();
    }
    context.restore();
  }

  function drawPearlBackground(centerX, centerY, time, palette) {
    context.fillStyle = '#faf9f6';
    context.fillRect(0, 0, width, height);

    const wash = context.createLinearGradient(0, 0, width, height);
    wash.addColorStop(0, 'rgba(226, 239, 244, 0.42)');
    wash.addColorStop(0.27, 'rgba(252, 246, 250, 0.2)');
    wash.addColorStop(0.52, 'rgba(232, 247, 239, 0.32)');
    wash.addColorStop(0.76, 'rgba(241, 229, 247, 0.32)');
    wash.addColorStop(1, 'rgba(249, 244, 231, 0.44)');
    context.fillStyle = wash;
    context.fillRect(0, 0, width, height);

    context.save();
    context.globalCompositeOperation = 'screen';
    const colors = [
      [112, 204, 215], [223, 135, 196], [141, 202, 161], [226, 185, 104],
    ];
    for (let band = 0; band < 5; band += 1) {
      const offset = Math.sin(time * 0.08 + band * 1.7) * 34;
      context.beginPath();
      context.moveTo(-80, centerY - 180 + band * 78 + offset);
      context.bezierCurveTo(
        width * 0.28, centerY - 250 + band * 56 - offset,
        width * 0.68, centerY + 170 - band * 32 + offset,
        width + 80, centerY - 110 + band * 50 - offset,
      );
      context.strokeStyle = rgba(colors[band % colors.length], 0.06);
      context.lineWidth = 70 + band * 14;
      context.stroke();
    }
    const pearlField = context.createRadialGradient(centerX, centerY, 22, centerX, centerY, Math.max(width, height) * 0.44);
    pearlField.addColorStop(0, rgba(palette.core, 0.18));
    pearlField.addColorStop(0.24, rgba(palette.edge, 0.08));
    pearlField.addColorStop(0.48, 'rgba(198, 180, 224, 0.055)');
    pearlField.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = pearlField;
    context.fillRect(0, 0, width, height);
    context.restore();

    context.save();
    context.lineWidth = 0.65;
    for (let ring = 0; ring < 6; ring += 1) {
      context.beginPath();
      context.ellipse(centerX, centerY + 42, 122 + ring * 90, 48 + ring * 31, -0.05, 0, Math.PI * 2);
      context.strokeStyle = `rgba(107, 119, 133, ${0.025 + ring * 0.004})`;
      context.stroke();
    }
    context.restore();
  }

  function drawPaperBackground(centerX, centerY, time, palette) {
    context.fillStyle = '#f7f3e9';
    context.fillRect(0, 0, width, height);
    if (paperPattern) {
      context.fillStyle = paperPattern;
      context.fillRect(0, 0, width, height);
    }

    const pressedField = context.createRadialGradient(centerX, centerY, 18, centerX, centerY, Math.max(width, height) * 0.42);
    pressedField.addColorStop(0, rgba(palette.edge, 0.06));
    pressedField.addColorStop(0.36, 'rgba(225, 221, 207, 0.18)');
    pressedField.addColorStop(1, 'rgba(247, 243, 233, 0)');
    context.fillStyle = pressedField;
    context.fillRect(0, 0, width, height);

    context.save();
    for (let contour = 0; contour < 8; contour += 1) {
      const radiusX = 102 + contour * 70;
      const radiusY = 44 + contour * 31;
      const wobble = Math.sin(time * 0.12 + contour) * 2.2;
      context.beginPath();
      context.ellipse(centerX, centerY + 28 + wobble, radiusX, radiusY, -0.04, 0, Math.PI * 2);
      context.strokeStyle = 'rgba(255, 255, 255, 0.54)';
      context.lineWidth = 1.6;
      context.stroke();
      context.translate(0, 1.2);
      context.strokeStyle = 'rgba(102, 85, 62, 0.065)';
      context.lineWidth = 0.8;
      context.stroke();
      context.translate(0, -1.2);
    }
    context.restore();

    context.save();
    context.strokeStyle = 'rgba(91, 77, 58, 0.035)';
    context.lineWidth = 0.7;
    const horizon = centerY + 96;
    for (let column = -9; column <= 9; column += 1) {
      context.beginPath();
      context.moveTo(centerX + column * 28, horizon);
      context.lineTo(centerX + column * 95, height + 40);
      context.stroke();
    }
    for (let row = 0; row < 10; row += 1) {
      const progress = row / 9;
      const y = horizon + progress * progress * (height - horizon + 50);
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
    context.restore();
  }

  function drawBackground(centerX, centerY, time, palette) {
    if (theme === 'pearl') drawPearlBackground(centerX, centerY, time, palette);
    else if (theme === 'paper') drawPaperBackground(centerX, centerY, time, palette);
    else drawLightwellBackground(centerX, centerY, time, palette);

    const contrast = theme === 'pearl'
      ? [92, 86, 112]
      : theme === 'paper'
        ? [104, 87, 63]
        : [68, 94, 102];
    context.save();
    context.translate(centerX, centerY);
    context.scale(1.52, 1);
    const well = context.createRadialGradient(0, 0, 18, 0, 0, Math.min(width, height) * 0.34);
    well.addColorStop(0, rgba(contrast, theme === 'paper' ? 0.1 : 0.12));
    well.addColorStop(0.34, rgba(contrast, theme === 'paper' ? 0.065 : 0.075));
    well.addColorStop(0.72, rgba(contrast, 0.025));
    well.addColorStop(1, rgba(contrast, 0));
    context.fillStyle = well;
    context.beginPath();
    context.arc(0, 0, Math.min(width, height) * 0.34, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawCore(centerX, centerY, time, palette) {
    const baseRadius = clamp(Math.min(width, height) * 0.105, 48, 74);
    const pulse = 1 + Math.sin(time * palette.speed * 2.1) * 0.026;
    const radius = baseRadius * pulse;

    context.save();
    context.globalCompositeOperation = theme === 'paper' ? 'source-over' : 'screen';

    const halo = context.createRadialGradient(centerX, centerY, radius * 0.58, centerX, centerY, radius * 2.3);
    halo.addColorStop(0, rgba(palette.core, theme === 'paper' ? 0.22 : 0.32));
    halo.addColorStop(0.28, rgba(palette.inner, theme === 'pearl' ? 0.16 : 0.12));
    halo.addColorStop(0.56, rgba(palette.edge, theme === 'lightwell' ? 0.08 : 0.11));
    halo.addColorStop(1, rgba(palette.edge, 0));
    context.fillStyle = halo;
    context.beginPath();
    context.arc(centerX, centerY, radius * 2.3, 0, Math.PI * 2);
    context.fill();

    for (let ring = 0; ring < 4; ring += 1) {
      const ringRadius = radius * (1.18 + ring * 0.22) + Math.sin(time * 0.55 + ring) * 2.4;
      context.beginPath();
      context.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
      context.strokeStyle = rgba(ring % 2 ? palette.edge : palette.inner, 0.1 - ring * 0.014);
      context.lineWidth = ring === 0 ? 2.4 : 1;
      context.stroke();
    }

    // Keep the halo additive, but composite the physical core normally. On a
    // light canvas, an additive sphere is mathematically washed into white.
    context.globalCompositeOperation = 'source-over';

    const sphere = context.createRadialGradient(
      centerX - radius * 0.28,
      centerY - radius * 0.32,
      radius * 0.08,
      centerX,
      centerY,
      radius,
    );
    sphere.addColorStop(0, rgba(palette.core, 0.98));
    sphere.addColorStop(0.28, rgba(palette.inner, 0.9));
    sphere.addColorStop(0.72, rgba(palette.edge, 0.78));
    sphere.addColorStop(1, rgba(palette.edge, 0.16));
    context.fillStyle = sphere;
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.fill();

    context.save();
    context.beginPath();
    context.arc(centerX, centerY, radius * 0.94, 0, Math.PI * 2);
    context.clip();
    context.globalCompositeOperation = 'screen';
    for (let stream = 0; stream < 18; stream += 1) {
      const phase = time * palette.speed * (0.24 + (stream % 5) * 0.035) + stream * 0.73;
      const y = centerY + Math.sin(phase * 1.17) * radius * 0.58;
      const x = centerX + Math.cos(phase * 0.81 + stream) * radius * 0.18;
      context.beginPath();
      context.ellipse(x, y, radius * (0.58 + (stream % 3) * 0.11), radius * 0.12, phase * 0.24, 0, Math.PI * 2);
      context.strokeStyle = rgba(stream % 3 === 0 ? palette.hot : palette.core, 0.08 + (stream % 4) * 0.022);
      context.lineWidth = 5 + (stream % 4) * 1.8;
      context.stroke();
    }
    context.restore();

    const highlight = context.createRadialGradient(
      centerX - radius * 0.32,
      centerY - radius * 0.38,
      0,
      centerX - radius * 0.16,
      centerY - radius * 0.2,
      radius * 0.64,
    );
    highlight.addColorStop(0, 'rgba(255,255,255,0.88)');
    highlight.addColorStop(0.22, 'rgba(255,255,255,0.28)');
    highlight.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = highlight;
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.fill();

    if (activeState === 'alert') {
      context.save();
      context.translate(centerX, centerY);
      context.rotate(time * 0.09);
      for (let shell = 0; shell < 2; shell += 1) {
        context.beginPath();
        context.ellipse(0, 0, radius * (1.34 + shell * 0.13), radius * (1.06 + shell * 0.08), shell * 1.2, -0.92, 0.92);
        context.ellipse(0, 0, radius * (1.34 + shell * 0.13), radius * (1.06 + shell * 0.08), shell * 1.2, Math.PI - 0.92, Math.PI + 0.92);
        context.strokeStyle = rgba(palette.inner, 0.24 - shell * 0.07);
        context.lineWidth = shell === 0 ? 2 : 1;
        context.stroke();
      }
      context.restore();
    }

    context.restore();
    return radius;
  }

  function playerPosition(player, centerX, centerY, time) {
    const ringRadiusX = [165, 268, 370][player.ring] * clamp(width / 1040, 0.82, 1.18);
    const ringRadiusY = [84, 145, 205][player.ring] * clamp(height / 640, 0.82, 1.08);
    const drift = time * (0.014 + player.ring * 0.004) * (player.ring % 2 ? -1 : 1);
    const angle = player.angle + drift;
    const flutter = Math.sin(time * 0.62 + player.phase) * (3 + player.ring * 1.3);
    return {
      x: centerX + Math.cos(angle) * ringRadiusX + flutter + pointerX * (5 + player.ring * 2),
      y: centerY + Math.sin(angle) * ringRadiusY + Math.cos(time * 0.44 + player.phase) * 3 + pointerY * (3 + player.ring),
    };
  }

  function drawConnection(centerX, centerY, x, y, alpha, palette, index) {
    const middleX = mix(centerX, x, 0.54) + Math.sin(index * 2.2) * 14;
    const middleY = mix(centerY, y, 0.54) + Math.cos(index * 1.7) * 8;
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.quadraticCurveTo(middleX, middleY, x, y);
    context.strokeStyle = rgba(index % 3 === 0 ? palette.inner : palette.edge, alpha * (theme === 'paper' ? 0.11 : 0.14));
    context.lineWidth = 0.65;
    context.stroke();
  }

  function drawPlayer(player, index, position, alpha, time, palette) {
    const { x, y } = position;
    const size = player.size * (0.84 + alpha * 0.16);
    const glowPulse = 0.76 + Math.sin(time * 1.2 + player.phase) * 0.18;
    const selected = player.importance === 2;

    context.save();
    context.globalAlpha = alpha;
    context.globalCompositeOperation = 'source-over';

    const glow = context.createRadialGradient(x, y, size * 0.42, x, y, size * 2.25);
    glow.addColorStop(0, rgba(selected ? palette.hot : palette.edge, (selected ? 0.27 : 0.15) * glowPulse));
    glow.addColorStop(0.42, rgba(palette.edge, 0.055));
    glow.addColorStop(1, rgba(palette.edge, 0));
    context.fillStyle = glow;
    context.beginPath();
    context.arc(x, y, size * 2.25, 0, Math.PI * 2);
    context.fill();

    context.beginPath();
    context.arc(x, y, size + 3, 0, Math.PI * 2);
    context.strokeStyle = rgba(selected ? palette.hot : palette.edge, selected ? 0.72 : 0.5);
    context.lineWidth = selected ? 2 : 1.2;
    context.stroke();

    context.save();
    context.beginPath();
    context.arc(x, y, size, 0, Math.PI * 2);
    context.clip();
    if (player.ready && player.image) {
      context.drawImage(player.image, x - size, y - size, size * 2, size * 2);
    } else {
      const fallback = context.createLinearGradient(x - size, y - size, x + size, y + size);
      fallback.addColorStop(0, rgba(palette.edge, 0.86));
      fallback.addColorStop(1, rgba(palette.hot, 0.9));
      context.fillStyle = fallback;
      context.fillRect(x - size, y - size, size * 2, size * 2);
      context.fillStyle = 'rgba(255,255,255,0.9)';
      context.font = `700 ${Math.max(8, size * 0.75)}px "Segoe UI"`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(player.name.slice(0, 1), x, y + 0.5);
    }
    context.restore();

    context.beginPath();
    context.arc(x - size * 0.32, y - size * 0.38, size * 0.38, Math.PI * 1.05, Math.PI * 1.73);
    context.strokeStyle = 'rgba(255,255,255,0.78)';
    context.lineWidth = 1;
    context.stroke();

    if (player.importance > 0) {
      const label = player.name;
      context.font = `${selected ? 600 : 540} ${selected ? 10 : 9}px "Segoe UI", "Microsoft YaHei"`;
      const textWidth = context.measureText(label).width;
      const labelY = y + size + 8;
      const labelHeight = selected ? 20 : 18;
      context.fillStyle = theme === 'paper'
        ? 'rgba(251, 247, 238, 0.9)'
        : 'rgba(255, 255, 255, 0.86)';
      context.strokeStyle = rgba(selected ? palette.hot : palette.edge, selected ? 0.23 : 0.14);
      context.lineWidth = 1;
      context.beginPath();
      context.roundRect(x - textWidth / 2 - 7, labelY, textWidth + 14, labelHeight, 5);
      context.fill();
      context.stroke();
      context.fillStyle = selected ? 'rgba(35, 39, 43, 0.92)' : 'rgba(52, 59, 63, 0.78)';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(label, x, labelY + labelHeight / 2 + 0.3);
    }

    context.restore();
  }

  function drawAmbientDust(time, palette) {
    let seed = 33717;
    const random = () => {
      seed = (seed * 48271) % 2147483647;
      return seed / 2147483647;
    };
    context.save();
    context.globalCompositeOperation = theme === 'paper' ? 'source-over' : 'screen';
    for (let index = 0; index < 90; index += 1) {
      const x = random() * width;
      const y = random() * height;
      const phase = random() * Math.PI * 2;
      const size = 0.35 + random() * 1.2;
      const alpha = 0.025 + (Math.sin(time * 0.34 + phase) * 0.5 + 0.5) * 0.055;
      context.fillStyle = rgba(index % 4 === 0 ? palette.hot : palette.edge, alpha);
      context.beginPath();
      context.arc(x, y, size, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  function render(now) {
    const elapsedMs = now - startedAt;
    const time = elapsedMs / 1000;
    const palette = statePalettes[activeState];
    pointerX += (targetPointerX - pointerX) * 0.035;
    pointerY += (targetPointerY - pointerY) * 0.035;

    const centerX = width * 0.5 + pointerX * 7;
    const centerY = height * 0.49 + pointerY * 4;
    context.clearRect(0, 0, width, height);
    drawBackground(centerX, centerY, time, palette);
    drawAmbientDust(time, palette);

    const visiblePlayers = [];
    for (let index = 0; index < players.length; index += 1) {
      const player = players[index];
      const alpha = smoothstep(player.revealAt, player.revealAt + 1100, elapsedMs);
      if (alpha <= 0) continue;
      const position = playerPosition(player, centerX, centerY, time);
      visiblePlayers.push({ player, index, alpha, position });
      drawConnection(centerX, centerY, position.x, position.y, alpha, palette, index);
    }

    visiblePlayers.sort((left, right) => left.player.ring - right.player.ring);
    for (const entry of visiblePlayers) {
      drawPlayer(entry.player, entry.index, entry.position, entry.alpha, time, palette);
    }

    countElement.textContent = String(visiblePlayers.length);
    requestAnimationFrame(render);
  }

  function setState(nextState) {
    activeState = nextState;
    document.body.dataset.radarState = nextState;
    for (const button of stateButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.state === nextState));
    }
    document.querySelector('.stage-meta span').textContent = `${statePalettes[nextState].label}扫描中`;
    window.dispatchEvent(new CustomEvent('radar-state-change', { detail: { state: nextState } }));
  }

  for (const button of stateButtons) {
    button.addEventListener('click', () => setState(button.dataset.state));
  }

  stage.addEventListener('pointermove', (event) => {
    const bounds = stage.getBoundingClientRect();
    targetPointerX = clamp((event.clientX - bounds.left) / bounds.width * 2 - 1, -1, 1);
    targetPointerY = clamp((event.clientY - bounds.top) / bounds.height * 2 - 1, -1, 1);
  });
  stage.addEventListener('pointerleave', () => {
    targetPointerX = 0;
    targetPointerY = 0;
  });

  window.addEventListener('resize', resize);
  resize();
  setState('alert');
  requestAnimationFrame(render);
})();
