/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  APIProvider, 
  Map as GoogleMap, 
  AdvancedMarker, 
  Pin as GooglePin, 
  useMap,
  useMapsLibrary
} from '@vis.gl/react-google-maps';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MapPin, 
  Navigation, 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle,
  Info,
  Plus,
  Compass,
  Settings,
  HelpCircle,
  Check,
  ChevronDown,
  Layers,
  Map as MapIcon,
  Sparkles,
  Sliders,
  Target,
  Edit2,
  TrendingDown,
  X,
  User,
  Star
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy, limit, addDoc, doc, setDoc } from 'firebase/firestore';

import { 
  QUADRANT_COORDINATES, 
  QUADRANT_21_2_COORDINATES, 
  MAP_ID, 
  TIPO_SERVICO_VT_LIST 
} from '../constants';

// Proper simple cn implementation
export function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}

// --- Types ---
export interface QSHReport {
  id: string;
  timestamp: number;
  quality: number; // Volume of CVLI
  safety: number;  // Security & Risk Level
  hygiene: number; // Patrol Needs
  coordinates: { lat: number, lng: number };
  note?: string;
  quadrantId: string;
  userName?: string;
  userEmail?: string;
}

export interface Quadrant {
  id: string;
  name: string;
  coordinates: { lat: number; lng: number }[];
}

export interface InsideQSHProps {
  user: any;
  isAdmin: boolean;
  isLocalMode: boolean;
  db: any;
}

// --- Helpers ---
function isPointInPolygon(point: { lat: number; lng: number }, polygon: { lat: number; lng: number }[]) {
  if (!polygon || polygon.length < 3) return false;
  let isInside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng;
    const xj = polygon[j].lat, yj = polygon[j].lng;
    const intersect = ((yi > point.lng) !== (yj > point.lng)) &&
        (point.lat < (xj - xi) * (point.lng - yi) / (yj - yi) + xi);
    if (intersect) isInside = !isInside;
  }
  return isInside;
}

// Polygon Layer for real Google Map
function PolygonLayer({ coordinates, color = "#3b82f6" }: { coordinates: { lat: number; lng: number }[], color?: string }) {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !mapsLib || !coordinates || coordinates.length < 3) return;

    const polygon = new mapsLib.Polygon({
      paths: coordinates,
      strokeColor: color,
      strokeOpacity: 0.8,
      strokeWeight: 3,
      fillColor: color,
      fillOpacity: 0.15,
      map: map,
    });

    return () => polygon.setMap(null);
  }, [map, mapsLib, coordinates, color]);

  return null;
}

export default function InsideQSH({ user, isAdmin, isLocalMode, db }: InsideQSHProps) {
  // App Modes: 'simulation' or 'google-maps'
  const [mapMode, setMapMode] = useState<'simulation' | 'google-maps'>('simulation');
  
  // Quadrants Management State
  const [quadrants, setQuadrants] = useState<Quadrant[]>([
    {
      id: 'qsh-21',
      name: 'QSH 21.0 (Serra Talhada - SDS/PE)',
      coordinates: QUADRANT_COORDINATES
    },
    {
      id: 'qsh-21-2',
      name: 'QSH 21.2 (São José do Belmonte - SDS/PE)',
      coordinates: QUADRANT_21_2_COORDINATES
    }
  ]);
  const [activeQuadrantId, setActiveQuadrantId] = useState<string>('qsh-21');
  const [autoSwitchByGps, setAutoSwitchByGps] = useState<boolean>(true);
  const [reportQuadrantId, setReportQuadrantId] = useState<string>('qsh-21');
  const [isAlertDismissed, setIsAlertDismissed] = useState<boolean>(false);
  const [mobileTab, setMobileTab] = useState<'panel' | 'map'>('map');

  // Goals & reductions states
  const [globalGoals, setGlobalGoals] = useState<{ q1: string; q2: string; q3: string; q4: string }>({
    q1: '2/3', q2: '1/3', q3: '0/0', q4: '0/0'
  });
  const [isEditingGoals, setIsEditingGoals] = useState(false);
  const [tempGoals, setTempGoals] = useState({ q1: '2/3', q2: '1/3', q3: '0/0', q4: '0/0' });

  const [globalReductions, setGlobalReductions] = useState<{ target2026: string; prevYear: string }>({
    target2026: '13', prevYear: '18'
  });
  const [isEditingReductions, setIsEditingReductions] = useState(false);
  const [tempReductions, setTempReductions] = useState({ target2026: '13', prevYear: '18' });

  // Custom Drawing Quadrant Mode States
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [drawingCoordinates, setDrawingCoordinates] = useState<{ lat: number; lng: number }[]>([]);
  const [isDrawingModalOpen, setIsDrawingModalOpen] = useState(false);
  const [newQuadrantName, setNewQuadrantName] = useState('');

  // User current location
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number }>({
    lat: -7.99011,
    lng: -38.28605
  });

  // Stored reports
  const [reports, setReports] = useState<QSHReport[]>([
    {
      id: "qd9b1a",
      timestamp: Date.now() - 3600000 * 2,
      quality: 1,
      safety: 4,
      hygiene: 2,
      coordinates: { lat: -7.99011, lng: -38.28605 },
      note: "Ronda tática operacional realizada. Nenhuma atividade criminosa observada no centro. Pontos comerciais seguros.",
      quadrantId: "qsh-21",
      userName: "Operador Convidado"
    },
    {
      id: "hz7f2c",
      timestamp: Date.now() - 3600000 * 5,
      quality: 4,
      safety: 5,
      hygiene: 5,
      coordinates: { lat: -7.98772, lng: -38.27435 },
      note: "CVLI suspeito relatado próximo ao beco escuro. Iluminação falha no quadrante superior esquerdo aumentando o risco local.",
      quadrantId: "qsh-21",
      userName: "Operador Convidado"
    },
    {
      id: "qsh212-rep1",
      timestamp: Date.now() - 3600000 * 1,
      quality: 5,
      safety: 4,
      hygiene: 3,
      coordinates: { lat: -7.86816, lng: -38.76791 },
      note: "Ocorrência grave de CVLI registrada. Equipes do Batalhão acionadas e patrulhamento tático mobilizado no setor de São José do Belmonte.",
      quadrantId: "qsh-21-2",
      userName: "Operador Convidado"
    }
  ]);

  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Custom API Key from env if any
  const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
  const [customApiKey, setCustomApiKey] = useState(GOOGLE_API_KEY);
  const [isUsingCustomKey, setIsUsingCustomKey] = useState(Boolean(GOOGLE_API_KEY));
  const [googleMapsError, setGoogleMapsError] = useState<string | null>(null);

  // Sync Google Key detection
  useEffect(() => {
    const key = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
    if (key) {
      setCustomApiKey(key);
      setIsUsingCustomKey(true);
    }
  }, []);

  // Sync with Firestore or LocalStorage
  useEffect(() => {
    if (isLocalMode) {
      try {
        const localReports = localStorage.getItem('siscopi_qsh_reports');
        if (localReports) setReports(JSON.parse(localReports));

        const localGoals = localStorage.getItem('siscopi_qsh_goals');
        if (localGoals) {
          setGlobalGoals(JSON.parse(localGoals));
          setTempGoals(JSON.parse(localGoals));
        }

        const localReductions = localStorage.getItem('siscopi_qsh_reductions');
        if (localReductions) {
          setGlobalReductions(JSON.parse(localReductions));
          setTempReductions(JSON.parse(localReductions));
        }
      } catch (err) {
        console.error("Error reading local QSH storage:", err);
      }
      return;
    }

    // Live Firebase Synch
    const reportsQuery = query(collection(db, 'qsh_reports'), orderBy('timestamp', 'desc'), limit(100));
    const unsubReports = onSnapshot(reportsQuery, (snapshot) => {
      const list: QSHReport[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
          id: docSnap.id,
          timestamp: d.timestamp || Date.now(),
          quality: d.quality ?? 3,
          safety: d.safety ?? 3,
          hygiene: d.hygiene ?? 3,
          coordinates: d.coordinates || { lat: -7.99011, lng: -38.28605 },
          note: d.note || '',
          quadrantId: d.quadrantId || 'qsh-21',
          userName: d.userName || 'Policial Militar',
          userEmail: d.userEmail || ''
        });
      });
      if (list.length > 0) {
        setReports(list);
      }
    }, (err) => {
      console.error("Error listening to qsh_reports:", err);
    });

    const unsubConfig = onSnapshot(doc(db, 'qsh_config', 'settings'), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.globalGoals) {
          setGlobalGoals(d.globalGoals);
          setTempGoals(d.globalGoals);
        }
        if (d.globalReductions) {
          setGlobalReductions(d.globalReductions);
          setTempReductions(d.globalReductions);
        }
      }
    }, (err) => {
      console.error("Error listening to qsh_config:", err);
    });

    return () => {
      unsubReports();
      unsubConfig();
    };
  }, [isLocalMode, db]);

  // Monitor Google Maps API errors
  useEffect(() => {
    (window as any).gm_authFailure = () => {
      setGoogleMapsError("Chave de API do Google Maps inválida ou com restrição de faturamento.");
    };
    return () => {
      try {
        delete (window as any).gm_authFailure;
      } catch (e) {}
    };
  }, []);

  const activeApiKey = isUsingCustomKey ? customApiKey : '';

  // Retrieve current active quadrant
  const activeQuadrant = useMemo(() => {
    return quadrants.find(q => q.id === activeQuadrantId) || quadrants[0];
  }, [quadrants, activeQuadrantId]);

  const reductionPercentage = useMemo(() => {
    const prev = parseFloat(globalReductions.prevYear);
    const target = parseFloat(globalReductions.target2026);
    if (isNaN(prev) || isNaN(target) || prev <= 0) return 0;
    return ((prev - target) / prev) * 100;
  }, [globalReductions]);

  // Bounding box for simulation center grid
  const bounds = useMemo(() => {
    const coords = activeQuadrant.coordinates;
    const lats = coords.map(c => c.lat);
    const lngs = coords.map(c => c.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const latSpan = Math.max(maxLat - minLat, 0.003);
    const lngSpan = Math.max(maxLng - minLng, 0.003);
    const padLat = latSpan * 0.18;
    const padLng = lngSpan * 0.18;

    return {
      minLat: minLat - padLat,
      maxLat: maxLat + padLat,
      minLng: minLng - padLng,
      maxLng: maxLng + padLng,
      latSpan: latSpan + padLat * 2,
      lngSpan: lngSpan + padLng * 2
    };
  }, [activeQuadrant]);

  // To percentage (0-100)
  const getXY = (lat: number, lng: number) => {
    const x = ((lng - bounds.minLng) / bounds.lngSpan) * 100;
    const y = (1 - (lat - bounds.minLat) / bounds.latSpan) * 100;
    return { x, y };
  };

  // From percentage to lat/lng
  const getLatLngFromXY = (xPct: number, yPct: number) => {
    const lng = bounds.minLng + (xPct / 100) * bounds.lngSpan;
    const lat = bounds.minLat + (1 - yPct / 100) * bounds.latSpan;
    return { lat, lng };
  };

  const currentPositionQuadrant = useMemo(() => {
    return quadrants.find(q => isPointInPolygon(userLocation, q.coordinates));
  }, [userLocation, quadrants]);

  const isInsideQuadrant = useMemo(() => {
    return isPointInPolygon(userLocation, activeQuadrant.coordinates);
  }, [userLocation, activeQuadrant]);

  // Switch by location
  useEffect(() => {
    if (autoSwitchByGps && currentPositionQuadrant && currentPositionQuadrant.id !== activeQuadrantId) {
      setActiveQuadrantId(currentPositionQuadrant.id);
    }
  }, [currentPositionQuadrant, autoSwitchByGps, activeQuadrantId]);

  // Trigger audio alert sound
  const triggerUIPing = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.25);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch (_) {}
  };

  useEffect(() => {
    if (isInsideQuadrant) {
      setIsAlertDismissed(false);
    } else {
      triggerUIPing();
    }
  }, [isInsideQuadrant]);

  const handleQuickCreateAroundUser = () => {
    const baseLat = userLocation.lat;
    const baseLng = userLocation.lng;
    const size = 0.0025;

    const namePrompt = prompt("Digite o nome deste novo quadrante geolocalizado:", `QSH Celular (${baseLat.toFixed(4)}, ${baseLng.toFixed(4)})`);
    if (namePrompt === null) return;

    const finalName = namePrompt.trim() ? namePrompt.trim() : `Quadrante Móvel ` + (quadrants.length + 1);

    const coords = [
      { lat: parseFloat((baseLat - size * 0.8).toFixed(5)), lng: parseFloat((baseLng - size).toFixed(5)) },
      { lat: parseFloat((baseLat + size * 0.8).toFixed(5)), lng: parseFloat((baseLng - size).toFixed(5)) },
      { lat: parseFloat((baseLat + size * 0.8).toFixed(5)), lng: parseFloat((baseLng + size).toFixed(5)) },
      { lat: parseFloat((baseLat - size * 0.8).toFixed(5)), lng: parseFloat((baseLng + size).toFixed(5)) },
      { lat: parseFloat((baseLat - size * 0.8).toFixed(5)), lng: parseFloat((baseLng - size).toFixed(5)) },
    ];

    const newQuad: Quadrant = {
      id: `quad-${Date.now()}`,
      name: finalName,
      coordinates: coords
    };

    setQuadrants(prev => [...prev, newQuad]);
    setActiveQuadrantId(newQuad.id);
  };

  const handleStartDrawing = () => {
    setIsDrawingMode(true);
    setDrawingCoordinates([]);
    alert("Modo de desenho ativo! Toque em 3 ou mais pontos no mapa interativo para traçar um setor. Ao terminar clique em 'Salvar Desenho'.");
  };

  const handleSaveDrawnQuadrant = () => {
    if (drawingCoordinates.length < 3) {
      alert("Selecione pelo menos 3 pontos no mapa para dar forma ao setor.");
      return;
    }
    setNewQuadrantName(`Setor Personalizado ${quadrants.length + 1}`);
    setIsDrawingModalOpen(true);
  };

  const handleConfirmDrawnQuadrant = () => {
    const finalName = newQuadrantName.trim() ? newQuadrantName.trim() : `Quadrante Desenhado ${quadrants.length}`;
    const coords = [...drawingCoordinates];
    if (coords[0].lat !== coords[coords.length - 1].lat || coords[0].lng !== coords[coords.length - 1].lng) {
      coords.push({ ...coords[0] });
    }

    const newQuad: Quadrant = {
      id: `quad-${Date.now()}`,
      name: finalName,
      coordinates: coords
    };

    setQuadrants(prev => [...prev, newQuad]);
    setActiveQuadrantId(newQuad.id);
    setIsDrawingMode(false);
    setDrawingCoordinates([]);
    setIsDrawingModalOpen(false);
  };

  const handleSyncRealLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setUserLocation(loc);
          if (loc.lat > 0 || loc.lng > -10) {
            if (confirm(`Detectamos que você está fora da região PE correspondente. Gostaria de focar no quadrante ativo?`)) {
              setUserLocation(activeQuadrant.coordinates[0]);
            }
          }
        },
        () => {
          alert("Não foi possível obter geolocalização nativa.");
        },
        { enableHighAccuracy: true }
      );
    }
  };

  const shiftLocation = (direction: 'N' | 'S' | 'E' | 'W') => {
    const STEP = 0.0006;
    setUserLocation(prev => {
      let nextLat = prev.lat;
      let nextLng = prev.lng;
      if (direction === 'N') nextLat += STEP;
      if (direction === 'S') nextLat -= STEP;
      if (direction === 'E') nextLng += STEP;
      if (direction === 'W') nextLng -= STEP;
      return { lat: parseFloat(nextLat.toFixed(5)), lng: parseFloat(nextLng.toFixed(5)) };
    });
  };

  const locationPresets = [
    { name: "QSH 21.0 - Unidade", lat: -7.99011, lng: -38.28605 },
    { name: "QSH 21.0 - Setor Leste", lat: -7.98772, lng: -38.27435 },
    { name: "QSH 21.2 - Unidade", lat: -7.86816, lng: -38.76791 },
    { name: "QSH 21.2 - Setor Leste", lat: -7.87984, lng: -38.74227 }
  ];



  const handleSaveGoalsInternal = async () => {
    setGlobalGoals(tempGoals);
    setIsEditingGoals(false);
    if (isLocalMode) {
      localStorage.setItem('siscopi_qsh_goals', JSON.stringify(tempGoals));
    } else {
      try {
        await setDoc(doc(db, 'qsh_config', 'settings'), { globalGoals: tempGoals }, { merge: true });
        alert("Metas salvas com sucesso no Firebase!");
      } catch (err) {
        console.error("Error saving goals to Firebase:", err);
      }
    }
  };

  const handleSaveReductionsInternal = async () => {
    setGlobalReductions(tempReductions);
    setIsEditingReductions(false);
    if (isLocalMode) {
      localStorage.setItem('siscopi_qsh_reductions', JSON.stringify(tempReductions));
    } else {
      try {
        await setDoc(doc(db, 'qsh_config', 'settings'), { globalReductions: tempReductions }, { merge: true });
        alert("Projeções de redução salvas com sucesso no Firebase!");
      } catch (err) {
        console.error("Error saving reductions to Firebase:", err);
      }
    }
  };

  const activeReports = useMemo(() => {
    return reports.filter(r => r.quadrantId === activeQuadrantId);
  }, [reports, activeQuadrantId]);



  const svgPolygonPoints = useMemo(() => {
    return activeQuadrant.coordinates.map(c => {
      const { x, y } = getXY(c.lat, c.lng);
      return `${x},${y}`;
    }).join(' ');
  }, [bounds, activeQuadrant]);

  return (
    <div className="relative h-[calc(100vh-70px)] md:h-[calc(100vh-100px)] w-full bg-slate-150 overflow-hidden flex flex-col md:flex-row rounded-t-3xl shadow-xl">
      
      {/* Sidebar - Control Deck */}
      <aside className={cn(
        "w-full md:w-[24rem] bg-white border-r border-slate-200 p-5 flex flex-col h-full z-20 overflow-y-auto no-scrollbar shrink-0 shadow-sm",
        mobileTab === 'panel' ? "h-full flex" : "hidden md:flex"
      )}>
        
        {/* Header Title */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <img 
              src="https://i.pinimg.com/originals/48/fa/00/48fa0041415bc64827c2bb66328ceb54.png" 
              alt="Dentro do QSH" 
              className="w-10 h-10 object-contain rounded-xl shadow-md border border-slate-100 bg-white" 
            />
            <div>
              <h1 className="text-sm font-black tracking-tight text-slate-900 uppercase">Dentro do QSH</h1>
              <div className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">
                14º BPM • POLÍCIA MILITAR
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button 
              onClick={() => setIsHelpOpen(true)}
              className="size-8 rounded-lg bg-slate-100 hover:bg-slate-200 transition flex items-center justify-center text-slate-600"
              title="Ajuda / Informações QSH"
            >
              <HelpCircle className="size-4" />
            </button>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="size-8 rounded-lg bg-slate-100 hover:bg-slate-200 transition flex items-center justify-center text-slate-600"
              title="Configurações de Chave"
            >
              <Settings className="size-4" />
            </button>
          </div>
        </div>

        {/* Dynamic Quadrant Selector */}
        <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100 mb-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider flex items-center gap-1.5">
              <Layers className="size-3.5 text-blue-600" />
              Quadrantes Monitorados
            </span>
          </div>

          <div className="relative">
            <select
              value={activeQuadrantId}
              onChange={(e) => {
                setActiveQuadrantId(e.target.value);
                const targetQuad = quadrants.find(q => q.id === e.target.value);
                if (targetQuad && targetQuad.coordinates.length > 0) {
                  setUserLocation(targetQuad.coordinates[0]);
                }
              }}
              className="w-full bg-white hover:bg-slate-50 text-xs font-bold text-slate-800 py-2.5 px-3.5 rounded-xl border border-slate-200 focus:outline-none appearance-none cursor-pointer transition"
            >
              {quadrants.map(q => (
                <option key={q.id} value={q.id}>
                  🗺️ {q.name}
                </option>
              ))}
            </select>
            <div className="absolute right-3.5 top-3 pointer-events-none text-slate-500">
              <ChevronDown className="size-4" />
            </div>
          </div>

          {/* Quick Setup Options */}
          <div className="grid grid-cols-2 gap-1.5 mt-0.5">
            <button
              onClick={handleQuickCreateAroundUser}
              className="bg-white hover:bg-slate-100 border border-slate-200 rounded-xl px-2.5 py-2 text-[9px] font-black tracking-wider text-slate-700 flex items-center justify-center gap-1 transition active:scale-95 shadow-sm"
            >
              <Sparkles className="size-3 text-yellow-500" />
              Incluir no GPS Atual
            </button>
            <button
              onClick={isDrawingMode ? handleSaveDrawnQuadrant : handleStartDrawing}
              className={cn(
                "border rounded-xl px-2.5 py-2 text-[9px] font-black tracking-wider flex items-center justify-center gap-1 transition active:scale-95 shadow-sm",
                isDrawingMode 
                  ? "bg-yellow-500 border-yellow-500 text-white" 
                  : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
              )}
            >
              <Plus className="size-3 text-blue-600" />
              {isDrawingMode ? "Salvar Desenho" : "Desenhar Setor"}
            </button>
          </div>

          {isDrawingMode && (
            <div className="flex items-center justify-between bg-yellow-50 border border-yellow-250 p-2 rounded-xl text-[10px] text-yellow-700 leading-none">
              <span>{drawingCoordinates.length} pontos inseridos.</span>
              <button 
                onClick={() => { setIsDrawingMode(false); setDrawingCoordinates([]); }}
                className="font-bold underline text-yellow-600 uppercase font-sans"
              >
                Cancelar
              </button>
            </div>
          )}

          {/* Real-time GPS Detection Indicator */}
          <div className="mt-0.5 pt-2 border-t border-slate-100 text-[11px] flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-bold flex items-center gap-1.5">
                <MapPin className="size-3.5 text-rose-500" />
                Localização: Setor Atual
              </span>
              <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-slate-400 hover:text-slate-600 font-semibold select-none">
                <input 
                  type="checkbox"
                  checked={autoSwitchByGps}
                  onChange={(e) => setAutoSwitchByGps(e.target.checked)}
                  className="rounded bg-white border-slate-300 text-blue-600 focus:ring-0 size-3"
                />
                Auto-focar
              </label>
            </div>
            
            {currentPositionQuadrant ? (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-xl p-2 text-emerald-800">
                <div className="truncate pr-2 font-bold text-xs flex items-center gap-1">
                  <Check className="size-3 shrink-0" />
                  {currentPositionQuadrant.name}
                </div>
                {currentPositionQuadrant.id !== activeQuadrantId && (
                  <button
                    onClick={() => setActiveQuadrantId(currentPositionQuadrant.id)}
                    className="shrink-0 text-[10px] font-black uppercase text-white bg-emerald-600 hover:bg-emerald-700 px-2 py-0.5 rounded-lg transition"
                  >
                    Focar
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-xl p-2 text-amber-800">
                <div className="font-bold text-xs">
                  ⚠️ Fora dos setores salvos
                </div>
                <button
                  onClick={handleQuickCreateAroundUser}
                  className="shrink-0 text-[9px] font-black uppercase text-white bg-amber-500 hover:bg-amber-600 px-1.5 py-0.5 rounded-lg transition"
                >
                  Criar setor aqui
                </button>
              </div>
            )}
          </div>
        </div>

        {/* QSH Active Metrics Dashboard */}
        <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100 mb-3">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <Target className="size-4 text-rose-600" />
              <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider">Metas do Trimestre</span>
              {isAdmin && !isEditingGoals && (
                <button 
                  onClick={() => setIsEditingGoals(true)}
                  className="flex items-center gap-1 text-[9px] uppercase font-bold text-rose-700 bg-rose-100 hover:bg-rose-200 px-2 py-0.5 rounded transition shadow-sm ml-1"
                  title="Editar Metas"
                >
                  <Edit2 className="size-3" />
                  <span>Editar</span>
                </button>
              )}
            </div>
            
            {isEditingGoals ? (
              <div className="flex gap-1.5">
                <button 
                  onClick={handleSaveGoalsInternal}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-bold px-2 py-0.5 rounded transition"
                >
                  Salvar
                </button>
                <button 
                  onClick={() => setIsEditingGoals(false)}
                  className="bg-slate-200 text-slate-700 text-[9px] font-bold px-2 py-0.5 rounded transition"
                >
                  Sair
                </button>
              </div>
            ) : (
              <span className="text-[9px] bg-white text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full font-mono font-bold">
                SDS PE 2026
              </span>
            )}
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            <div className="bg-white p-2 rounded-xl border border-slate-100 text-center">
              <p className="text-[9px] font-bold text-rose-500 mb-0.5">1º Trim</p>
              {isEditingGoals ? (
                <input 
                  type="text" 
                  value={tempGoals.q1} 
                  onChange={(e) => setTempGoals(prev => ({ ...prev, q1: e.target.value }))}
                  className="w-full text-center bg-slate-50 border border-slate-200 rounded py-0.5 text-xs font-black text-slate-800 focus:outline-none"
                />
              ) : (
                <p className="text-xs font-black text-slate-800">{globalGoals.q1}</p>
              )}
            </div>
            <div className="bg-white p-2 rounded-xl border border-slate-100 text-center">
              <p className="text-[9px] font-bold text-amber-500 mb-0.5">2º Trim</p>
              {isEditingGoals ? (
                <input 
                  type="text" 
                  value={tempGoals.q2} 
                  onChange={(e) => setTempGoals(prev => ({ ...prev, q2: e.target.value }))}
                  className="w-full text-center bg-slate-50 border border-slate-200 rounded py-0.5 text-xs font-black text-slate-800 focus:outline-none"
                />
              ) : (
                <p className="text-xs font-black text-slate-800">{globalGoals.q2}</p>
              )}
            </div>
            <div className="bg-white p-2 rounded-xl border border-slate-100 text-center">
              <p className="text-[9px] font-bold text-slate-500 mb-0.5">3º Trim</p>
              {isEditingGoals ? (
                <input 
                  type="text" 
                  value={tempGoals.q3} 
                  onChange={(e) => setTempGoals(prev => ({ ...prev, q3: e.target.value }))}
                  className="w-full text-center bg-slate-50 border border-slate-200 rounded py-0.5 text-xs font-black text-slate-800 focus:outline-none"
                />
              ) : (
                <p className="text-xs font-black text-slate-800">{globalGoals.q3}</p>
              )}
            </div>
            <div className="bg-white p-2 rounded-xl border border-slate-100 text-center">
              <p className="text-[9px] font-bold text-slate-500 mb-0.5">4º Trim</p>
              {isEditingGoals ? (
                <input 
                  type="text" 
                  value={tempGoals.q4} 
                  onChange={(e) => setTempGoals(prev => ({ ...prev, q4: e.target.value }))}
                  className="w-full text-center bg-slate-50 border border-slate-200 rounded py-0.5 text-xs font-black text-slate-800 focus:outline-none"
                />
              ) : (
                <p className="text-xs font-black text-slate-800">{globalGoals.q4}</p>
              )}
            </div>
          </div>
        </div>

        {/* Target Reductions */}
        <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100 mb-3">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <TrendingDown className="size-4 text-emerald-600" />
              <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider">Comparativo de Redução</span>
              {isAdmin && !isEditingReductions && (
                <button 
                  onClick={() => setIsEditingReductions(true)}
                  className="flex items-center gap-1 text-[9px] uppercase font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-2 py-0.5 rounded transition shadow-sm ml-1"
                  title="Editar Reduções"
                >
                  <Edit2 className="size-3" />
                  <span>Editar</span>
                </button>
              )}
            </div>
            
            {isEditingReductions ? (
              <div className="flex gap-1.5">
                <button 
                  onClick={handleSaveReductionsInternal}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-bold px-2 py-0.5 rounded transition"
                >
                  Salvar
                </button>
                <button 
                  onClick={() => setIsEditingReductions(false)}
                  className="bg-slate-200 text-slate-700 text-[9px] font-bold px-2 py-0.5 rounded transition"
                >
                  Sair
                </button>
              </div>
            ) : (
              <span className="text-[9px] bg-white text-emerald-600 border border-emerald-100 px-2 py-0.5 rounded-full font-mono font-bold">
                META DE IMPACTO
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="bg-white p-2.5 rounded-xl border border-slate-100 text-center">
              <p className="text-[9px] font-bold text-slate-500 mb-0.5">MVI (Ano Anterior)</p>
              {isEditingReductions ? (
                <input 
                  type="text" 
                  value={tempReductions.prevYear} 
                  onChange={(e) => setTempReductions(prev => ({ ...prev, prevYear: e.target.value }))}
                  className="w-full text-center bg-slate-50 border border-slate-200 rounded py-0.5 text-xs font-black text-slate-800 focus:outline-none"
                />
              ) : (
                <p className="text-sm font-black text-slate-800">{globalReductions.prevYear} casos</p>
              )}
            </div>
            
            <div className="bg-white p-2.5 rounded-xl border border-slate-100 text-center">
              <p className="text-[9px] font-bold text-cyan-600 mb-0.5">NVI (Ano Atual)</p>
              {isEditingReductions ? (
                <input 
                  type="text" 
                  value={tempReductions.target2026} 
                  onChange={(e) => setTempReductions(prev => ({ ...prev, target2026: e.target.value }))}
                  className="w-full text-center bg-slate-50 border border-slate-200 rounded py-0.5 text-xs font-black text-slate-800 focus:outline-none"
                />
              ) : (
                <p className="text-sm font-black text-slate-800">{globalReductions.target2026} casos</p>
              )}
            </div>
          </div>

          <div className="bg-white px-2.5 py-1.5 rounded-xl border border-slate-100 flex items-center justify-between">
            <span className="text-[9px] font-bold text-slate-400">Variação Projetada</span>
            {reductionPercentage > 0 ? (
              <span className="text-[9px] font-black text-emerald-600 font-sans">-{reductionPercentage.toFixed(1)}% de redução</span>
            ) : (
              <span className="text-[9px] font-black text-slate-400 font-sans">Sem variação</span>
            )}
          </div>
        </div>

      </aside>

      {/* Main Map Area */}
      <main className={cn(
        "flex-1 relative flex flex-col h-full bg-slate-100",
        mobileTab === 'map' ? "h-full flex" : "hidden md:flex"
      )}>
        
        {/* Real Google Maps Wrapper */}
        {mapMode === 'google-maps' && (
          <div className="absolute inset-0 z-0 bg-slate-200">
            {googleMapsError ? (
              <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center z-10 relative bg-white/95 backdrop-blur-sm">
                <AlertTriangle className="size-12 text-rose-500 mb-4 animate-pulse" />
                <h3 className="text-base font-black uppercase tracking-wider text-rose-600 mb-2">Restrição de Licença Google Maps</h3>
                <p className="text-xs text-rose-900 font-mono bg-rose-50 border border-rose-100 px-3.5 py-2.5 rounded-xl mb-4 max-w-sm leading-relaxed">
                  {googleMapsError}
                </p>
                <p className="text-xs text-slate-500 max-w-xs mb-6">
                  Para mapeamento satélite nativo do Google, forneça uma chave com faturamento habilitado. Caso contrário utilize o nosso <strong>Vetor de Simulação local</strong>.
                </p>
                <div className="flex flex-col gap-2.5 w-full max-w-xs">
                  <button 
                    onClick={() => {
                      setGoogleMapsError(null);
                      setMapMode('simulation');
                    }} 
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black uppercase py-2.5 rounded-xl transition text-[10px]"
                  >
                    Usar Simulação Tática Local
                  </button>
                  <button 
                    onClick={() => {
                      setGoogleMapsError(null);
                      setIsSettingsOpen(true);
                    }} 
                    className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-black uppercase py-2.5 rounded-xl transition text-[10px]"
                  >
                    Configurar Outra Chave
                  </button>
                  <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${userLocation.lat},${userLocation.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full bg-rose-600 hover:bg-rose-700 text-white font-black uppercase py-2.5 rounded-xl transition text-[10px] flex items-center justify-center gap-1.5 shadow-lg"
                  >
                    <MapIcon className="size-3.5" />
                    Abrir no Google Maps® Externo ↗
                  </a>
                </div>
              </div>
            ) : isUsingCustomKey ? (
              <APIProvider apiKey={activeApiKey} version="weekly">
                <div className="absolute top-4 left-4 z-20">
                  <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${userLocation.lat},${userLocation.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 bg-white/95 hover:bg-slate-50 border border-slate-200 text-rose-650 font-bold px-3 py-2 rounded-xl text-xs transition shadow-md pointer-events-auto"
                  >
                    <MapIcon className="size-3.5" />
                    Google Maps® Externo ↗
                  </a>
                </div>
                <GoogleMap
                  defaultCenter={userLocation}
                  defaultZoom={13}
                  mapId={MAP_ID}
                  disableDefaultUI={true}
                  internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                  style={{ width: '100%', height: '100%' }}
                  onClick={(ev: any) => {
                    let lat: number | undefined;
                    let lng: number | undefined;
                    
                    if (ev.detail && ev.detail.latLng) {
                      lat = typeof ev.detail.latLng.lat === 'function' ? ev.detail.latLng.lat() : ev.detail.latLng.lat;
                      lng = typeof ev.detail.latLng.lng === 'function' ? ev.detail.latLng.lng() : ev.detail.latLng.lng;
                    } else if (ev.latLng) {
                      lat = typeof ev.latLng.lat === 'function' ? ev.latLng.lat() : ev.latLng.lat;
                      lng = typeof ev.latLng.lng === 'function' ? ev.latLng.lng() : ev.latLng.lng;
                    }

                    if (typeof lat === 'number' && typeof lng === 'number') {
                      const formattedLatLng = {
                        lat: parseFloat(lat.toFixed(5)),
                        lng: parseFloat(lng.toFixed(5))
                      };
                      if (isDrawingMode) {
                        setDrawingCoordinates(prev => [...prev, formattedLatLng]);
                      } else {
                        setUserLocation(formattedLatLng);
                      }
                    }
                  }}
                >
                  <PolygonLayer coordinates={activeQuadrant.coordinates} />
                  
                  {/* User marker representing custom coordinate */}
                  <AdvancedMarker position={userLocation}>
                    <div className="relative flex items-center justify-center">
                      <div className="absolute animate-ping bg-blue-500 size-7 rounded-full opacity-60" />
                      <GooglePin background="#2563eb" borderColor="#ffffff" glyphColor="#ffffff" scale={1.2} />
                    </div>
                  </AdvancedMarker>

                  {/* Reports rendered on Google Map */}
                  {activeReports.map((report) => (
                    <AdvancedMarker key={report.id} position={report.coordinates}>
                      <GooglePin background="#10b981" borderColor="#ffffff" glyphColor="#ffffff" scale={0.9}>
                        <CheckCircle2 className="text-white size-3" />
                      </GooglePin>
                    </AdvancedMarker>
                  ))}
                </GoogleMap>
              </APIProvider>
            ) : null}
          </div>
        )}

        {/* Simulation Vector Map Mode */}
        {mapMode === 'simulation' && (
          <div className="absolute inset-0 z-0 bg-slate-50 flex flex-col p-4 md:p-6">
            <div className="w-full flex-1 relative bg-white rounded-3xl border border-slate-200 shadow-inner overflow-hidden flex flex-col">
              
              {/* Grid Background Overlay */}
              <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px] opacity-70 pointer-events-none" />

              {/* The Interactive Styled SVG Map viewport */}
              <div className="flex-1 relative overflow-hidden flex items-center justify-center p-4">
                <svg 
                  className="w-full h-full max-h-[440px] md:max-h-[550px] relative z-10 cursor-crosshair select-none"
                  viewBox="-5 -5 110 110"
                  preserveAspectRatio="xMidYMid meet"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;
                    const clickY = e.clientY - rect.top;
                    
                    const xPct = (clickX / rect.width) * 100;
                    const yPct = (clickY / rect.height) * 100;
                    
                    const newLatLng = getLatLngFromXY(xPct, yPct);
                    const formattedLatLng = {
                      lat: parseFloat(newLatLng.lat.toFixed(5)),
                      lng: parseFloat(newLatLng.lng.toFixed(5))
                    };

                    if (isDrawingMode) {
                      setDrawingCoordinates(prev => [...prev, formattedLatLng]);
                    } else {
                      setUserLocation(formattedLatLng);
                    }
                  }}
                >
                  <defs>
                    <linearGradient id="oceanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#f1f5f9" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#cbd5e1" stopOpacity="0.9" />
                    </linearGradient>
                    <radialGradient id="quadGrad" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity="0.12" />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
                    </radialGradient>
                    <radialGradient id="drawGrad" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#eab308" stopOpacity="0.15" />
                      <stop offset="100%" stopColor="#eab308" stopOpacity="0.0" />
                    </radialGradient>
                  </defs>

                  {/* QSH Regional boundary representation */}
                  <path 
                    d="M 94,-5 Q 85,25 90,50 T 82,105 L 105,105 L 105,-5 Z" 
                    fill="url(#oceanGrad)" 
                    stroke="#94a3b8" 
                    strokeWidth="0.8"
                    opacity="0.5"
                  />
                  <text x="96" y="50" fill="#94a3b8" fontSize="2.2" className="font-sans tracking-widest font-black uppercase" writingMode="vertical-rl" opacity="0.6">
                    MUNICÍPIO LIMITE
                  </text>

                  {/* Monitored Quadrant Area boundary polygon */}
                  {activeQuadrant.coordinates && activeQuadrant.coordinates.length >= 3 && (
                    <polygon 
                      points={svgPolygonPoints} 
                      fill="url(#quadGrad)" 
                      stroke="#2563eb" 
                      strokeWidth="1.2" 
                      strokeDasharray="2,2"
                      className="animate-pulse"
                    />
                  )}
                  
                  {/* Outer Sector reference labels */}
                  <text x="45" y="32" fill="#2563eb" fontSize="2.8" fontWeight="bold" opacity="0.4" className="text-center">
                    SETORES DO 14º BPM
                  </text>
                  <text x="3" y="94" fill="#94a3b8" fontSize="1.8" fontFamily="monospace">
                    Base: {bounds.minLat.toFixed(4)}
                  </text>
                  <text x="75" y="94" fill="#94a3b8" fontSize="1.8" fontFamily="monospace">
                    Final: {bounds.maxLng.toFixed(4)}
                  </text>

                  {/* Render Custom Drawing vertex points/lines */}
                  {drawingCoordinates.map((coord, idx) => {
                    const { x, y } = getXY(coord.lat, coord.lng);
                    return (
                      <g key={idx}>
                        <circle cx={x} cy={y} r="2" fill="#eab308" />
                        <text x={x + 2} y={y + 0.5} fill="#ca8a04" fontSize="1.6" fontWeight="bold">
                          {idx + 1}
                        </text>
                      </g>
                    );
                  })}
                  {drawingCoordinates.length >= 3 && (
                    <polygon 
                      points={drawingCoordinates.map(c => { const {x,y} = getXY(c.lat, c.lng); return `${x},${y}`; }).join(' ')}
                      fill="url(#drawGrad)"
                      stroke="#eab308"
                      strokeWidth="1"
                      strokeDasharray="2,2"
                    />
                  )}
                  {drawingCoordinates.length > 1 && drawingCoordinates.length < 3 && (
                    <polyline
                      points={drawingCoordinates.map(c => { const {x,y} = getXY(c.lat, c.lng); return `${x},${y}`; }).join(' ')}
                      fill="none"
                      stroke="#eab308"
                      strokeWidth="1.2"
                    />
                  )}

                  {/* Render QSH stored report pins */}
                  {activeReports.map((report) => {
                    const { x, y } = getXY(report.coordinates.lat, report.coordinates.lng);
                    const avgRating = (report.quality + report.safety + report.hygiene) / 3;
                    const ratingColor = avgRating >= 4 ? "#10b981" : (avgRating >= 3 ? "#f59e0b" : "#ef4444");
                    return (
                      <g key={report.id}>
                        <circle cx={x} cy={y} r="2.8" fill={ratingColor} opacity="0.3" />
                        <circle cx={x} cy={y} r="1.3" fill={ratingColor} />
                        <text x={x + 2} y={y + 0.8} fill="#64748b" fontSize="1.5" className="font-mono">
                          #{report.id.substring(0, 4).toUpperCase()}
                        </text>
                      </g>
                    );
                  })}

                  {/* Simulated User Location dot */}
                  {(() => {
                    const { x, y } = getXY(userLocation.lat, userLocation.lng);
                    return (
                      <g className="transition-all duration-300">
                        <circle cx={x} cy={y} r="5" fill="#2563eb" opacity="0.3" className="animate-ping" style={{ transformOrigin: `${x}px ${y}px` }} />
                        <circle cx={x} cy={y} r="2.8" fill="#1d4ed8" />
                        <circle cx={x} cy={y} r="1.2" fill="#ffffff" />
                        
                        <g transform={`translate(${x - 14}, ${y - 12})`}>
                          <rect width="28" height="7.5" rx="2" fill="#1e293b" opacity="0.9" />
                          <text x="14" y="5" fill="#38bdf8" fontSize="1.6" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                            Você (Sim)
                          </text>
                        </g>
                      </g>
                    );
                  })()}
                </svg>

                {/* Simulated location helper instruction */}
                <div className="absolute top-3 left-3 bg-white/95 backdrop-blur border border-slate-200 rounded-xl p-3 pointer-events-auto z-20">
                  <span className={cn(
                    "text-[9px] uppercase tracking-wider font-extrabold flex items-center gap-1.5",
                    isDrawingMode ? "text-yellow-600" : "text-blue-600"
                  )}>
                    <span className={cn("w-1.5 h-1.5 rounded-full", isDrawingMode ? "bg-yellow-500" : "bg-blue-500 animate-pulse")} />
                    {isDrawingMode ? "Modo Desenho de Setor" : "Controle de GPS"}
                  </span>
                  <p className="text-[10px] text-slate-500 mt-1 max-w-[210px] leading-tight font-medium">
                    {isDrawingMode 
                      ? "Toque nos limites do mapa acima para marcar os limites. Clique em Salvar ao terminar!"
                      : "Dê um toque em qualquer ponto do mapa para teleportar e simular seu GPS de patrulha."
                    }
                  </p>
                </div>

                {/* Floating telemetry HUD */}
                <div className="absolute bottom-3 right-3 bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl p-3 pointer-events-auto z-20 shadow-sm">
                  <div className="space-y-1 font-mono text-[10px] text-slate-750">
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-400">Lat:</span>
                      <span className="font-bold text-slate-800">{userLocation.lat.toFixed(5)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-400">Lng:</span>
                      <span className="font-bold text-slate-800">{userLocation.lng.toFixed(5)}</span>
                    </div>
                    <div className="border-t border-slate-100 my-1.5 pt-1.5 text-center">
                      <a 
                        href={`https://www.google.com/maps/search/?api=1&query=${userLocation.lat},${userLocation.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 transition flex items-center justify-center gap-1 font-bold font-sans text-[10px]"
                      >
                        <MapIcon className="size-3 text-blue-600 shrink-0" />
                        Ver no Google Maps® ↗
                      </a>
                    </div>
                  </div>
                </div>

              </div>

              {/* Simulation Controls pad */}
              <div className="bg-slate-50 border-t border-slate-200 p-4 shrink-0 flex flex-col sm:flex-row gap-4 pointer-events-auto justify-between items-center z-10 rounded-b-3xl">
                
                {/* Walking Arrow Controls */}
                <div className="flex flex-col items-center">
                  <span className="text-[8px] font-black tracking-widest text-slate-400 uppercase mb-1.5">Mover Coordenadas</span>
                  <div className="flex items-center gap-1">
                    <div className="w-8" />
                    <button 
                      onClick={() => shiftLocation('N')}
                      className="size-9 bg-white hover:bg-slate-100 active:scale-95 border border-slate-200 text-xs font-black text-slate-700 rounded-xl flex items-center justify-center transition"
                      title="Norte"
                    >
                      N
                    </button>
                    <button 
                      onClick={handleSyncRealLocation}
                      className="size-9 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 active:scale-95 rounded-xl flex items-center justify-center font-bold text-white shadow-md transition"
                      title="Usar GPS Nativo"
                    >
                      <Navigation className="size-4.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <button 
                      onClick={() => shiftLocation('W')}
                      className="size-9 bg-white hover:bg-slate-100 active:scale-95 border border-slate-200 text-xs font-black text-slate-700 rounded-xl flex items-center justify-center transition"
                      title="Oeste"
                    >
                      W
                    </button>
                    <button 
                      onClick={() => shiftLocation('S')}
                      className="size-9 bg-white hover:bg-slate-100 active:scale-95 border border-slate-200 text-xs font-black text-slate-700 rounded-xl flex items-center justify-center transition"
                      title="Sul"
                    >
                      S
                    </button>
                    <button 
                      onClick={() => shiftLocation('E')}
                      className="size-9 bg-white hover:bg-slate-100 active:scale-95 border border-slate-200 text-xs font-black text-slate-700 rounded-xl flex items-center justify-center transition"
                      title="Leste"
                    >
                      E
                    </button>
                  </div>
                </div>

                {/* Location Jump Presets */}
                <div className="flex-1 w-full sm:w-auto">
                  <div className="text-center sm:text-left mb-1.5">
                    <span className="text-[8px] font-black tracking-widest text-slate-400 uppercase">Pontos Preset de Patrulha</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {locationPresets.map((p) => (
                      <button
                        key={p.name}
                        onClick={() => setUserLocation({ lat: p.lat, lng: p.lng })}
                        className={cn(
                          "px-3 py-2 text-[10px] font-bold rounded-xl text-left border transition active:scale-98",
                          Math.abs(userLocation.lat - p.lat) < 0.0001 && Math.abs(userLocation.lng - p.lng) < 0.0001
                            ? "bg-blue-50 border-blue-200 text-blue-700" 
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* Global Floating Status HUD Overlay */}
        <div className="absolute top-4 right-4 pointer-events-auto z-10 flex flex-col gap-2">
          {isInsideQuadrant ? (
            <div className="bg-emerald-600 text-white py-2 px-3.5 rounded-xl flex items-center gap-2 shadow-lg text-xs font-bold">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
              </span>
              <span>Área Ativa: {activeQuadrant.name.split(' (')[0]}</span>
            </div>
          ) : (
            <div className="bg-amber-500 text-white py-2 px-3.5 rounded-xl flex items-center gap-2 shadow-lg text-xs font-bold">
              <AlertTriangle className="size-3.5" />
              <span>Fora de Cobertura QSH</span>
            </div>
          )}
        </div>



      </main>

      {/* Mobile Tab Selector Bottom Bar */}
      <div className="md:hidden fixed bottom-14 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-100 flex items-center justify-around py-2 px-4 z-40 shadow-md">
        <button
          onClick={() => setMobileTab('panel')}
          className={cn(
            "flex-1 py-2 px-3 rounded-xl font-bold text-[10px] flex flex-col items-center justify-center gap-1 transition-all",
            mobileTab === 'panel' ? "bg-slate-100 text-slate-900" : "text-slate-400"
          )}
        >
          <Sliders className="size-4 text-indigo-500" />
          <span>Métricas</span>
        </button>
        <button
          onClick={() => setMobileTab('map')}
          className={cn(
            "flex-1 py-2 px-3 rounded-xl font-bold text-[10px] flex flex-col items-center justify-center gap-1 transition-all",
            mobileTab === 'map' ? "bg-slate-100 text-slate-900" : "text-slate-400"
          )}
        >
          <Compass className="size-4 text-blue-500" />
          <span>Mapa QSH</span>
        </button>
      </div>



      {/* Settings Modal (Maps Custom API Config) */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl w-full max-w-md text-slate-800 z-10"
            >
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-700"
              >
                <X className="size-5" />
              </button>

              <h3 className="text-base font-black text-slate-950 mb-2 flex items-center gap-2 uppercase">
                <Settings className="size-5 text-blue-650" />
                Configurar Google Maps® API
              </h3>
              
              <p className="text-xs text-slate-500 mb-4 leading-relaxed font-semibold">
                Insira uma chave do Google Maps Platform habilitada para liberar as camadas de satélite geo-posicionadas reais.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Chave Google Maps</label>
                  <input 
                    type="password"
                    value={customApiKey}
                    onChange={(e) => setCustomApiKey(e.target.value)}
                    placeholder="Insira sua chave de Mapa..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-800 focus:outline-none"
                  />
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-[11px] text-slate-500 space-y-1">
                  <p className="text-blue-600 font-bold mb-1">Importante:</p>
                  <p>A chave deve ter permissões para Maps JavaScript API.</p>
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    onClick={() => {
                      setIsUsingCustomKey(false);
                      setIsSettingsOpen(false);
                      setMapMode('simulation');
                    }}
                    className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-500"
                  >
                    Usar Apenas Vetor Local
                  </button>
                  <button
                    onClick={() => {
                      if (customApiKey.trim()) {
                        setGoogleMapsError(null);
                        setIsUsingCustomKey(true);
                        setIsSettingsOpen(false);
                        setMapMode('google-maps');
                      } else {
                        alert("Por favor insira uma chave.");
                      }
                    }}
                    className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 rounded-xl text-xs font-bold text-white shadow-md"
                  >
                    Salvar & Ativar Chave
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Save Drawn Quadrant Modal */}
      <AnimatePresence>
        {isDrawingModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDrawingModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white border border-slate-250 rounded-3xl p-6 shadow-2xl w-full max-w-sm text-slate-800 z-10"
            >
              <h3 className="text-sm font-black text-slate-900 mb-2 flex items-center gap-2 uppercase">
                <Layers className="size-5 text-yellow-550" />
                Salvar Novo Setor Mapeado
              </h3>

              <p className="text-xs text-slate-500 mb-4 leading-relaxed font-semibold">
                Insira uma identificação para o polígono de <strong>{drawingCoordinates.length} pontos</strong> desenhado.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5 font-sans">Identificação do Setor</label>
                  <input 
                    type="text"
                    value={newQuadrantName}
                    onChange={(e) => setNewQuadrantName(e.target.value)}
                    placeholder="Ex: QSH Setor Centenário"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs focus:border-blue-500 focus:outline-none"
                    autoFocus
                  />
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    onClick={() => setIsDrawingModalOpen(false)}
                    className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-250 rounded-xl text-xs font-bold text-slate-500"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={handleConfirmDrawnQuadrant}
                    className="flex-1 py-2.5 px-4 bg-yellow-500 hover:bg-yellow-600 text-white rounded-xl text-xs font-black transition"
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Guide/Help Modal */}
      <AnimatePresence>
        {isHelpOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsHelpOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl w-full max-w-sm text-slate-800 z-10 font-sans"
            >
              <button 
                onClick={() => setIsHelpOpen(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-700"
              >
                <X className="size-5" />
              </button>

              <h3 className="text-base font-black text-slate-900 mb-2 flex items-center gap-2">
                <Info className="size-5 text-blue-650" />
                Guia Operacional Dentro do QSH
              </h3>

              <div className="space-y-3 text-xs text-slate-600 leading-relaxed max-h-[70vh] overflow-y-auto pr-1">
                <p>
                  O <strong>QSH Monitor</strong> permite o rastreamento em tempo real do policiamento tático preventivo em relação às estatísticas criminais locais no território do 14º BPM.
                </p>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-2">
                  <p className="font-bold text-slate-800 text-[10px] uppercase tracking-wider">Métricas e Índices:</p>
                  <p><strong>Impacto CVLI (Q):</strong> Indica a carga histórica ou recente de CVLI no perímetro.</p>
                  <p><strong>Vistas / Vulnerabilidades (S):</strong> Avaliação física sobre luminosidade, vias de fuga e pontos de vulnerabilidade.</p>
                  <p><strong>Necessidade de Ronda (R):</strong> Medida de saturação policial necessária para conter desvios.</p>
                </div>

                <p>
                  <strong>Criando Setores:</strong> Você pode adicionar ou mesmo Desenhar seus próprios setores poligonais diretamente no visor vetorial simulado.
                </p>
              </div>

              <div className="mt-6">
                <button
                  onClick={() => setIsHelpOpen(false)}
                  className="w-full bg-slate-900 hover:bg-slate-850 text-white font-bold py-2.5 rounded-xl text-xs transition"
                >
                  Entendi
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
