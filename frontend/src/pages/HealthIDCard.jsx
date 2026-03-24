/* eslint-disable react/no-unknown-property */
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Canvas, useFrame, extend } from '@react-three/fiber';
import { Environment, Lightformer, RoundedBox } from '@react-three/drei';
import {
  BallCollider,
  CuboidCollider,
  Physics,
  RigidBody,
  useRopeJoint,
  useSphericalJoint,
} from '@react-three/rapier';
import { MeshLineGeometry, MeshLineMaterial } from 'meshline';
import * as THREE from 'three';

import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, setDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import Aurora from '../components/Aurora';
import './HealthIDCard.css';

extend({ MeshLineGeometry, MeshLineMaterial });

// ─── Constants ────────────────────────────────────────────────────────────────

function getBadge(improved, declined, hazard, activeDays = 0) {
  if (hazard >= 1) return { label: 'Hazard', emoji: '☢️', color: '#ff1744', glow: '#d50000', improved };
  if (declined >= 2) return { label: 'Critical', emoji: '🚨', color: '#ff5252', glow: '#ff1744', improved };
  if (declined === 1) return { label: 'At Risk', emoji: '⚠️', color: '#ff9100', glow: '#ff6d00', improved };
  
  // High-tier badges require data maturity (at least 3 days logged)
  if (activeDays >= 3) {
    if (improved >= 4) return { label: 'Platinum', emoji: '💎', color: '#b2f5f5', glow: '#00e0ff', improved };
    if (improved >= 2) return { label: 'Gold', emoji: '🥇', color: '#ffe370', glow: '#ffb800', improved };
    if (improved === 1) return { label: 'Silver', emoji: '🥈', color: '#c8d6e5', glow: '#a0b4c8', improved };
  } else if (activeDays > 0) {
    // New users with some data but not yet enough for Gold/Platinum
    if (improved >= 1) return { label: 'Silver', emoji: '🥈', color: '#c8d6e5', glow: '#a0b4c8', improved };
  }

  return { label: 'Starter', emoji: '🌱', color: '#69f0ae', glow: '#00c853', improved };
}

const METRICS = [
  { key: 'diabetes', label: 'Diabetes Risk', icon: '🩸' },
  { key: 'hypertension', label: 'Blood Pressure', icon: '❤️' },
  { key: 'cholesterol', label: 'Cholesterol', icon: '🫀' },
  { key: 'lactose', label: 'Lactose', icon: '🥛' },
  { key: 'weight', label: 'Weight Management', icon: '⚖️' },
];

const parseRiskLevel = (val) => {
    if (val === 'High' || val === 'Severe') return 3;
    if (val === 'Medium' || val === 'Mild') return 2;
    if (val === 'Low' || val === 'None' || val === 'Unknown') return 0;
    return Number(val) || 0;
};

// ─── High-res Card Canvas Texture ─────────────────────────────────────────────
function drawRoundRect(ctx, x, y, w, h, r) {
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

function buildCardTexture({ profile, weeklyTrends, badge, photoUrl, onReady }) {
  // Double the resolution for crystal clear text (2048 x 3072)
  const W = 2048, H = 3072;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  function draw(avatarImg) {
    // ── Background ──
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#060a16');
    bg.addColorStop(0.5, '#0a0f1e');
    bg.addColorStop(1, '#0c0818');
    ctx.fillStyle = bg;
    drawRoundRect(ctx, 0, 0, W, H, 112);
    ctx.fill();

    // ── High-end Cyber Border ──
    ctx.save();
    drawRoundRect(ctx, 8, 8, W - 16, H - 16, 104);
    ctx.strokeStyle = 'rgba(0,224,255,0.6)';
    ctx.lineWidth = 12;
    ctx.shadowColor = '#00e0ff';
    ctx.shadowBlur = 72;
    ctx.stroke();
    ctx.restore();

    // ── Top accent stripe ──
    const stripe = ctx.createLinearGradient(0, 10, W, 10);
    stripe.addColorStop(0, 'rgba(0,224,255,0.12)');
    stripe.addColorStop(0.5, 'rgba(0,224,255,0.25)');
    stripe.addColorStop(1, 'rgba(124,58,237,0.15)');
    ctx.fillStyle = stripe;
    ctx.fillRect(0, 0, W, 280);

    // ── App name ──
    ctx.fillStyle = '#00e0ff';
    ctx.font = 'bold 88px Inter, sans-serif';
    ctx.letterSpacing = '16px';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('INGRELYZE', 112, 140);

    // ── Badge chip (High Res) ──
    const chipTxt = `${badge.emoji} ${badge.label}`;
    ctx.font = 'bold 72px Inter, sans-serif';
    const chipW = ctx.measureText(chipTxt).width + 104;
    const chipX = W - chipW - 80;
    ctx.fillStyle = badge.glow + '33';
    drawRoundRect(ctx, chipX, 80, chipW, 128, 40);
    ctx.fill();
    ctx.strokeStyle = badge.color;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = badge.color;
    ctx.textAlign = 'center';
    ctx.fillText(chipTxt, chipX + chipW/2, 144);

    // ── Avatar circle ──
    const avatarCX = W / 2, avatarCY = 640, avatarR = 296;
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarCX, avatarCY, avatarR + 24, 0, Math.PI * 2);
    ctx.strokeStyle = '#00e0ff';
    ctx.lineWidth = 12;
    ctx.shadowColor = '#00e0ff';
    ctx.shadowBlur = 80;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarCX, avatarCY, avatarR, 0, Math.PI * 2);
    ctx.clip();
    if (avatarImg) {
      ctx.drawImage(avatarImg, avatarCX - avatarR, avatarCY - avatarR, avatarR * 2, avatarR * 2);
    } else {
      const grad = ctx.createRadialGradient(avatarCX - 80, avatarCY - 80, 40, avatarCX, avatarCY, avatarR);
      grad.addColorStop(0, '#1e40af');
      grad.addColorStop(1, '#7c3aed');
      ctx.fillStyle = grad;
      ctx.fillRect(avatarCX - avatarR, avatarCY - avatarR, avatarR * 2, avatarR * 2);
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.font = `bold ${avatarR}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(profile.name?.[0]?.toUpperCase() || '?', avatarCX, avatarCY + 16);
    }
    ctx.restore();

    // ── Name & Metadata ──
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 144px Inter, sans-serif';
    ctx.fillText(profile.name || 'User', W / 2, 1080);

    ctx.fillStyle = 'rgba(180,210,240,0.8)';
    ctx.font = '88px Inter, sans-serif';
    const metaParts = [];
    if (profile.age) metaParts.push(`Age ${profile.age}`);
    if (profile.gender) metaParts.push(profile.gender);
    ctx.fillText(metaParts.join(' · '), W / 2, 1216);

    // ── Divider ──
    ctx.save();
    const divGrad = ctx.createLinearGradient(160, 0, W - 160, 0);
    divGrad.addColorStop(0, 'transparent');
    divGrad.addColorStop(0.5, 'rgba(0,224,255,0.4)');
    divGrad.addColorStop(1, 'transparent');
    ctx.strokeStyle = divGrad;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(160, 1300); ctx.lineTo(W - 160, 1300);
    ctx.stroke();
    ctx.restore();

    // ── Metrics Row ──
    const metricStartY = 1360;
    const metricH = 312; // Double the height logic
    METRICS.forEach((m, i) => {
      const y = metricStartY + i * metricH;
      const status = weeklyTrends?.[m.key] || 'stable';

      // Row Background
      const rowBg = ctx.createLinearGradient(112, y, W - 112, y);
      if (status === 'improved') {
        rowBg.addColorStop(0, 'rgba(74, 222, 128, 0.12)');
        rowBg.addColorStop(1, 'rgba(74, 222, 128, 0.04)');
      } else if (status === 'declined') {
        rowBg.addColorStop(0, 'rgba(251, 146, 60, 0.14)');
        rowBg.addColorStop(1, 'rgba(251, 146, 60, 0.04)');
      } else if (status === 'hazard') {
        rowBg.addColorStop(0, 'rgba(239, 68, 68, 0.22)');
        rowBg.addColorStop(1, 'rgba(239, 68, 68, 0.06)');
      } else {
        rowBg.addColorStop(0, 'rgba(255,255,255,0.06)');
        rowBg.addColorStop(1, 'rgba(255,255,255,0.02)');
      }
      ctx.fillStyle = rowBg;
      drawRoundRect(ctx, 112, y, W - 224, metricH - 40, 48);
      ctx.fill();

      // Row Border
      ctx.strokeStyle = status === 'improved' ? 'rgba(74, 222, 128, 0.35)'
        : (status === 'declined' || status === 'hazard') ? 'rgba(251, 146, 60, 0.45)'
        : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 4;
      ctx.stroke();

      // Perfect Vertical Centering for Row Content
      const centerY = y + (metricH - 40) / 2;
      
      // Icon
      ctx.font = '96px serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.icon, 184, centerY);

      // Label (smaller to avoid overlap)
      ctx.fillStyle = '#f1f5f9';
      ctx.font = 'bold 68px Inter, sans-serif';
      ctx.fillText(m.label, 344, centerY);

      // Status
      ctx.textAlign = 'right';
      const displayTxt = status === 'improved' ? 'Improved ▲' 
                       : status === 'hazard'   ? 'Hazard ☣'
                       : status === 'declined' ? 'Worsened ▼' 
                       : status === 'initial'  ? 'Awaiting Data —'
                       : 'Stable —';
                       
      ctx.fillStyle = status === 'improved' ? '#4ade80' 
                    : status === 'hazard'   ? '#ff1744'
                    : status === 'declined' ? '#fb923c' 
                    : '#94a3b8';
                    
      ctx.font = `bold 72px Inter, sans-serif`;
      ctx.fillText(displayTxt, W - 184, centerY);
    });

    // ── Footer ──
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(148,163,184,0.6)';
    ctx.font = '64px Inter, sans-serif';
    ctx.fillText(`Health ID · Ingrelyze · ${new Date().getFullYear()}`, W / 2, H - 96);

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 16;
    onReady(texture, canvas);
  }

  if (photoUrl) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => draw(img);
    img.onerror = () => draw(null);
    img.src = photoUrl;
  } else {
    draw(null);
  }
}

// ─── Physics Band + Card ─────────────────────────────────────────────────────
function Band({ maxSpeed = 50, minSpeed = 10, isMobile = false, profile, badge, photoUrl, cardTexture }) {
  const band = useRef();
  const fixed = useRef();
  const j1 = useRef();
  const j2 = useRef();
  const j3 = useRef();
  const card = useRef();

  const vec = useMemo(() => new THREE.Vector3(), []);
  const ang = useMemo(() => new THREE.Vector3(), []);
  const rot = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);

  const segmentProps = {
    type: 'dynamic', canSleep: true, colliders: false, angularDamping: 4, linearDamping: 4,
  };

  const [curve] = useState(
    () => new THREE.CatmullRomCurve3([
      new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
    ])
  );

  const bandTexture = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, '#1a1a2e');
    g.addColorStop(0.35, '#0f3460');
    g.addColorStop(0.65, '#16213e');
    g.addColorStop(1, '#1a1a2e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 256);
    ctx.fillStyle = 'rgba(0,224,255,0.22)'; ctx.fillRect(28, 0, 8, 256);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }, []);

  const [dragged, drag] = useState(false);
  const [hovered, hover] = useState(false);

  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], 1]);
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], 1]);
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], 1]);
  useSphericalJoint(j3, card, [[0, 0, 0], [0, 1.05, 0]]);

  useEffect(() => {
    if (hovered) {
      document.body.style.cursor = dragged ? 'grabbing' : 'grab';
      return () => { document.body.style.cursor = 'auto'; };
    }
  }, [hovered, dragged]);

  useFrame((state, delta) => {
    if (dragged) {
      vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera);
      dir.copy(vec).sub(state.camera.position).normalize();
      vec.add(dir.multiplyScalar(state.camera.position.length()));
      [card, j1, j2, j3, fixed].forEach(ref => ref.current?.wakeUp());
      card.current?.setNextKinematicTranslation({
        x: vec.x - dragged.x, y: vec.y - dragged.y, z: vec.z - dragged.z,
      });
    }
    if (fixed.current) {
      [j1, j2].forEach(ref => {
        if (!ref.current.lerped)
          ref.current.lerped = new THREE.Vector3().copy(ref.current.translation());
        const d = Math.max(0.1, Math.min(1, ref.current.lerped.distanceTo(ref.current.translation())));
        ref.current.lerped.lerp(ref.current.translation(), delta * (minSpeed + d * (maxSpeed - minSpeed)));
      });
      curve.points[0].copy(j3.current.translation());
      curve.points[1].copy(j2.current.lerped);
      curve.points[2].copy(j1.current.lerped);
      curve.points[3].copy(fixed.current.translation());
      band.current.geometry.setPoints(curve.getPoints(isMobile ? 16 : 32));
      ang.copy(card.current.angvel());
      rot.copy(card.current.rotation());
      card.current.setAngvel({ x: ang.x, y: ang.y - rot.y * 0.25, z: ang.z });
    }
  });

  curve.curveType = 'chordal';

  return (
    <>
      <group position={[0, 6.5, 0]}>
        <RigidBody ref={fixed} {...segmentProps} type="fixed" />
        <RigidBody position={[0.5, 0, 0]} ref={j1} {...segmentProps}><BallCollider args={[0.1]} /></RigidBody>
        <RigidBody position={[1, 0, 0]} ref={j2} {...segmentProps}><BallCollider args={[0.1]} /></RigidBody>
        <RigidBody position={[1.5, 0, 0]} ref={j3} {...segmentProps}><BallCollider args={[0.1]} /></RigidBody>
        <RigidBody
          position={[2, 0, 0]} ref={card} {...segmentProps}
          type={dragged ? 'kinematicPosition' : 'dynamic'}
        >
          <CuboidCollider args={[0.75, 1.125, 0.01]} />
          <group
            scale={1.75} position={[0, -1.2, -0.05]}
            onPointerOver={() => hover(true)}
            onPointerOut={() => hover(false)}
            onPointerUp={e => (e.target.releasePointerCapture(e.pointerId), drag(false))}
            onPointerDown={e => (
              e.target.setPointerCapture(e.pointerId),
              drag(new THREE.Vector3().copy(e.point).sub(vec.copy(card.current.translation())))
            )}
          >
            {/* Card body */}
            <RoundedBox args={[1.5, 2.25, 0.04]} radius={0.08} smoothness={4} position={[0, 0, 0]}>
              <meshPhysicalMaterial color="#050a18" metalness={0.8} roughness={0.15} clearcoat={1} clearcoatRoughness={0.05} />
            </RoundedBox>
            {/* High-res canvas texture face */}
            {cardTexture && (
              <mesh position={[0, 0, 0.022]}>
                <planeGeometry args={[1.5, 2.25]} />
                <meshBasicMaterial map={cardTexture} transparent />
              </mesh>
            )}
            {/* Metal clip */}
            <mesh position={[0, 1.2, 0]}>
              <boxGeometry args={[0.18, 0.22, 0.05]} />
              <meshStandardMaterial color="#aaa" metalness={1} roughness={0.1} />
            </mesh>
          </group>
        </RigidBody>
      </group>

      {/* Lanyard rope */}
      <mesh ref={band}>
        <meshLineGeometry />
        <meshLineMaterial
          color="#00e0ff" depthTest={false}
          resolution={isMobile ? [1000, 2000] : [1000, 1000]}
          useMap map={bandTexture} repeat={[-4, 1]} lineWidth={0.8}
        />
      </mesh>
    </>
  );
}

// ─── Metric row (right panel) ─────────────────────────────────────────────────
function MetricRow({ metric, status }) {
  return (
    <div className={`hid-metric-row hid-status-${status}`}>
      <span className="hid-metric-icon">{metric.icon}</span>
      <div className="hid-metric-info">
        <span className="hid-metric-label">{metric.label}</span>
      </div>
      <div className="hid-metric-right">
        {status === 'improved' && <span className="hid-trend hid-trend-up" style={{fontSize: '0.85rem'}}>▲ Improved</span>}
        {status === 'declined' && <span className="hid-trend hid-trend-down" style={{fontSize: '0.85rem'}}>▼ Worsened</span>}
        {status === 'hazard' && <span className="hid-trend hid-trend-hazard" style={{fontSize: '0.85rem'}}>☣ Hazard</span>}
        {status === 'stable' && <span className="hid-trend hid-trend-stable" style={{fontSize: '0.85rem'}}>— Stable</span>}
        {status === 'initial' && <span className="hid-trend hid-trend-stable" style={{fontSize: '0.85rem', opacity: 0.6}}>— Awaiting Data</span>}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function HealthIDCard() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [cardTexture, setCardTexture] = useState(null);
  const [cardCanvas, setCardCanvas] = useState(null);
  const [weeklyTrends, setWeeklyTrends] = useState({
    diabetes: 'initial',
    hypertension: 'initial',
    cholesterol: 'initial',
    lactose: 'initial',
    weight: 'initial'
  });
  const [badgeInfo, setBadgeInfo] = useState({ label: 'Starter', emoji: '🌱', color: '#69f0ae', glow: '#00c853' });
  const [activeDaysCount, setActiveDaysCount] = useState(0);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const fileInputRef = useRef();

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  useEffect(() => {
    if (!currentUser) { navigate('/login'); return; }
    (async () => {
      try {
        const docRef = doc(db, 'users', currentUser.uid);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const d = snap.data();
          setProfile({
            name: d.name || currentUser.displayName || 'User',
            age: d.age || '',
            gender: d.gender || '',
            weight: d.weight || '',
            height: d.height || '',
            weightGoal: d.weightGoal || '',
            activityLevel: d.activityLevel || '',
            dietType: d.dietType || '',
            diabetes: d.diabetes || 'Low',
            hypertension: d.hypertension || 'Low',
            cholesterol: d.cholesterol || 'Low',
            lactose: d.lactose || 'None',
            gluten: d.gluten || 'None',
          });
          if (d.healthCardPhoto) setPhotoUrl(d.healthCardPhoto);
        }
      } catch (err) {
        console.error('HealthIDCard load error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [currentUser, navigate]);

  // Fetch 7-day Weekly Usage Data
  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      try {
        const heatDates = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          heatDates.push(d.toLocaleDateString('en-CA'));
        }

        const q = query(
          collection(db, 'foodEntries'),
          where('userId', '==', currentUser.uid)
        );
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const dailyMap = {};
          heatDates.forEach(d => dailyMap[d] = { calories: 0, sugar: 0, fat: 0, sodium: 0, lactoseRisky: false });

          snapshot.forEach(doc => {
            const data = doc.data();
            if (dailyMap[data.date]) {
              dailyMap[data.date].calories += Number(data.calories || 0);
              dailyMap[data.date].sugar += Number(data.sugar || 0);
              dailyMap[data.date].fat += Number(data.fat || 0);
              dailyMap[data.date].sodium += Number(data.sodium || 0);
              
              // Lactose check logic:
              const dairyWords = ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'whey', 'lactose', 'pizza', 'ice cream'];
              const foodName = (data.foodName || "").toLowerCase();
              if (dairyWords.some(w => foodName.includes(w))) {
                dailyMap[data.date].lactoseRisky = true;
              }
            }
          });

          const activeDays = Object.values(dailyMap).filter(d => d.calories > 0).length;
          if (activeDays >= 1) {
            let totSugar = 0, totFat = 0, totSodium = 0, totCalories = 0, riskyLactoseDays = 0;
            Object.values(dailyMap).forEach(d => {
               totSugar += d.sugar; totFat += d.fat; totSodium += d.sodium; totCalories += d.calories;
               if (d.lactoseRisky) riskyLactoseDays++;
            });
            const avgSugar = totSugar / activeDays;
            const avgFat = totFat / activeDays;
            const avgSodium = totSodium / activeDays;
            const avgCalories = totCalories / activeDays;

            setActiveDaysCount(activeDays);

            // Lactose Trend Logic:
            // If user has lactose condition and avoids it -> improved
            // If they eat it -> declined
            const hasLactoseRisk = profile?.lactose && profile.lactose !== 'None';
            let lactoseStatus = 'stable';
            if (hasLactoseRisk) {
              lactoseStatus = riskyLactoseDays === 0 ? 'improved' : 'declined';
            }

            const dLevel = parseRiskLevel(profile?.diabetes);
            const maxSugar = (50 - (dLevel * 10)); // Meal max is ~50. Daily avg threshold is similar.
            
            const bpLevel = parseRiskLevel(profile?.hypertension);
            const maxSodium = (800 - (bpLevel * 150)); 
            
            const cLevel = parseRiskLevel(profile?.cholesterol);
            const maxSatFat = (15 - (cLevel * 3));

            // Weight calculation:
            const wGoal = profile?.weightGoal || 'maintain';
            let targetCal = 2000;
            if (wGoal === 'lose') targetCal = 1700;
            if (wGoal === 'gain_muscle') targetCal = 2400;

            const calculateStatus = (val, max) => {
                if (val > max * 1.5) return 'hazard';
                if (val > max) return 'declined';
                // Only grant 'improved' if we have enough data to prove a trend (>= 3 days)
                if (activeDays >= 3 && val < max * 0.7) return 'improved';
                return 'stable';
            };

            setWeeklyTrends({
              diabetes: calculateStatus(avgSugar, maxSugar),
              hypertension: calculateStatus(avgSodium, maxSodium),
              cholesterol: calculateStatus(avgFat, maxSatFat),
              lactose: lactoseStatus,
              weight: calculateStatus(avgCalories, targetCal)
            });
          }
        }, (err) => {
          console.error('Failed to listen to food entries for ID card', err);
        });

        return () => unsubscribe();
      } catch (err) {
        console.error('Failed to fetch food entries for ID card', err);
      }
    })();
  }, [currentUser]);

  // Compute Badge when weeklyTrends or profile updates
  useEffect(() => {
    if (!profile) return;
    let improved = 0;
    let declined = 0;
    let hazard = 0;

    METRICS.forEach(m => {
      const status = weeklyTrends[m.key];
      if (status === 'improved') improved++;
      if (status === 'declined') declined++;
      if (status === 'hazard') hazard++;
    });

    setBadgeInfo(getBadge(improved, declined, hazard, activeDaysCount));
  }, [profile, weeklyTrends, activeDaysCount]);

  useEffect(() => {
    if (!profile) return;
    buildCardTexture({ 
      profile, 
      weeklyTrends, 
      badge: badgeInfo, 
      photoUrl, 
      onReady: (tex, canvas) => {
        setCardTexture(tex);
        setCardCanvas(canvas);
      } 
    });
  }, [profile, weeklyTrends, badgeInfo, photoUrl]);

  const handleDownload = useCallback(() => {
    if (!cardCanvas || !profile) return;
    const link = document.createElement('a');
    link.download = `HealthID_${(profile.name || 'User').replace(/\s+/g, '_')}.jpg`;
    link.href = cardCanvas.toDataURL('image/jpeg', 0.92);
    link.click();
  }, [cardCanvas, profile?.name]);

  const handlePhotoUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = async () => {
        // Compress image using canvas
        const MAX_SIZE = 400;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to a compressed lightweight JPEG
        const compressedUrl = canvas.toDataURL('image/jpeg', 0.85);
        setPhotoUrl(compressedUrl);

        try {
          await setDoc(doc(db, 'users', currentUser.uid), { healthCardPhoto: compressedUrl }, { merge: true });
        } catch (err) {
          console.error('Failed to save avatar:', err);
        }
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }, [currentUser]);

  if (loading || !profile) {
    return (
      <div className="hid-loading">
        <div className="spinner" />
        <p>Loading your Health ID…</p>
      </div>
    );
  }

  const goalLabel =
    { lose: '📉 Lose Weight', maintain: '⚖️ Maintain', gain_muscle: '💪 Gain Muscle' }[profile.weightGoal] || '—';

  return (
    <div className="hid-root">
      <Aurora 
        colorStops={['#080d1c', '#7c3aed', '#00e0ff']} 
        amplitude={1.2} 
        blend={0.5} 
        speed={0.5}
      />
      {/* Left — 3D Lanyard */}
      <div className="hid-canvas-col">
        <div className="hid-canvas-label">Drag the card to swing it!</div>
        <Canvas
          camera={{ position: [0, 0, 14], fov: 28 }}
          dpr={[1, isMobile ? 3 : 4]}
          gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
          onCreated={({ gl, camera }) => {
            gl.setClearColor(new THREE.Color(0), 0);
            camera.lookAt(0, 0.5, 0);
          }}
          style={{ background: 'transparent' }}
        >
          <ambientLight intensity={Math.PI} />
          <Physics gravity={[0, -40, 0]} timeStep={isMobile ? 1 / 30 : 1 / 60}>
            <Band
              isMobile={isMobile}
              profile={profile}
              badge={badgeInfo}
              photoUrl={photoUrl}
              cardTexture={cardTexture}
            />
          </Physics>
          <Environment blur={0.75}>
            <Lightformer intensity={2} color="white" position={[0, -1, 5]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
            <Lightformer intensity={3} color="#00e0ff" position={[-1, -1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
            <Lightformer intensity={3} color="white" position={[1, 1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
            <Lightformer intensity={8} color="white" position={[-10, 0, 14]} rotation={[0, Math.PI / 2, Math.PI / 3]} scale={[100, 10, 1]} />
          </Environment>
        </Canvas>
      </div>

        {/* Right — Info Panel */}
        <div className="hid-panel" style={{ position: 'relative', zIndex: 10 }}>
          <div className="hid-panel-header">
          <div className="hid-panel-title">Health ID Card</div>
          <div className="hid-panel-sub">Your personal health identity</div>
        </div>

        <div className="hid-avatar-section">
          <div className="hid-avatar-wrap" onClick={() => fileInputRef.current?.click()}>
            {photoUrl
              ? <img src={photoUrl} alt="Profile" className="hid-avatar-img" />
              : <div className="hid-avatar-placeholder">{profile.name?.[0]?.toUpperCase() || '?'}</div>
            }
            <div className="hid-avatar-overlay">📷 Upload</div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoUpload} />
          <div className="hid-user-info">
            <div className="hid-user-name">{profile.name}</div>
            <div className="hid-user-meta">
              {profile.age && <span>Age {profile.age}</span>}
              {profile.gender && <span> · {profile.gender}</span>}
            </div>
            {profile.weight && profile.height && (
              <div className="hid-user-meta">{profile.weight} kg · {profile.height} cm</div>
            )}
          </div>
        </div>

        <div className="hid-badge-section" style={{ borderColor: badgeInfo.glow + '66' }}>
          <span className="hid-badge-emoji">{badgeInfo.emoji}</span>
          <div>
            <div className="hid-badge-name" style={{ color: badgeInfo.color }}>{badgeInfo.label} Member</div>
            <div className="hid-badge-desc">
              {badgeInfo.improved > 0
                ? `${badgeInfo.improved} health indicator${badgeInfo.improved > 1 ? 's' : ''} on track`
                : 'Log more foods to earn your first badge!'}
            </div>
          </div>
        </div>

        <div className="hid-section-title">Health Metrics</div>
        <div className="hid-metrics-list">
          {METRICS.map(m => (
            <MetricRow key={m.key} metric={m} status={weeklyTrends[m.key]} />
          ))}
        </div>

        {/* Download row centered */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
          <button className="hid-download-btn" onClick={handleDownload}>
            <span className="hid-download-icon">📥</span>
            Download Health ID
          </button>
        </div>

        <div className="hid-baseline-note" style={{ marginTop: '0.5rem' }}>
          This card represents your <strong>real-time health status</strong>. Share it with medical professionals to provide a quick overview of your dietary trends.
        </div>
      </div>
    </div>
  );
}
