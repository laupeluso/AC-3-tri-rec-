import { FaceLandmarker, FilesetResolver, type FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import * as faceapi from '@vladmandic/face-api';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import type {
  FaceProfile,
  FaceSample,
  FaceMatchEvaluation,
  BiometricSettings,
  SecurityAuditEntry,
  QualityMetrics,
  LivenessState,
} from '../types/face';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const PROFILE_STORAGE_KEY = 'faceid_access_profile_v1';
const SETTINGS_STORAGE_KEY = 'faceid_access_settings_v1';
const AUDIT_STORAGE_KEY = 'faceid_access_audit_v1';

export const DEFAULT_SETTINGS: BiometricSettings = {
  similarityThreshold: 0.58, // Limiar calibrado padrão para VGGFace2/ResNet-34
  consecutiveFramesRequired: 5,
  livenessRequired: true,
  cooldownSeconds: 4,
  soundEffects: true,
  showMeshOverlay: true,
  showHUDTelemetry: true,
};

class FaceRecognitionService {
  private faceLandmarker: FaceLandmarker | null = null;
  private isFaceApiLoaded: boolean = false;
  private isMediaPipeLoaded: boolean = false;
  private initPromise: Promise<void> | null = null;

  // Track consecutive matches
  private consecutiveMatchesCount: number = 0;
  private lastMatchTimestamp: number = 0;

  // Liveness internal state
  private livenessState: LivenessState = {
    blinkCount: 0,
    lastBlinkTime: 0,
    isBlinking: false,
    yawDegrees: 0,
    pitchDegrees: 0,
    rollDegrees: 0,
    livenessPassed: false,
  };

  public async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        await Promise.all([this.initMediaPipe(), this.initFaceApi()]);
        console.log('[FaceID Engine] Modelos MediaPipe e Face-API inicializados com sucesso.');
      } catch (err) {
        console.error('Falha ao inicializar modelos de reconhecimento facial:', err);
        throw err;
      }
    })();

    return this.initPromise;
  }

  private async initMediaPipe(): Promise<void> {
    if (this.isMediaPipeLoaded && this.faceLandmarker) return;

    try {
      // Carregar WASM local de /mediapipe/wasm com fallback para CDN
      let filesetResolver;
      try {
        filesetResolver = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
      } catch {
        filesetResolver = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
      }

      const modelPath = '/mediapipe/face_landmarker.task';

      this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: modelPath,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 2,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      });

      this.isMediaPipeLoaded = true;
    } catch (e) {
      console.warn('Erro ao inicializar MediaPipe com GPU, tentando modo CPU:', e);
      try {
        const filesetResolver = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
        this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: '/mediapipe/face_landmarker.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numFaces: 2,
          outputFaceBlendshapes: true,
        });
        this.isMediaPipeLoaded = true;
      } catch {
        const filesetResolver = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
        this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numFaces: 2,
          outputFaceBlendshapes: true,
        });
        this.isMediaPipeLoaded = true;
      }
    }
  }

  private async initFaceApi(): Promise<void> {
    if (this.isFaceApiLoaded) return;

    try {
      const MODEL_URL = '/models/face-api';
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      this.isFaceApiLoaded = true;
      console.log('[FaceID Engine] Redes neurais carregadas: TinyFaceDetector, FaceLandmark68Net, FaceRecognitionNet (128D)');
    } catch (err) {
      console.error('Erro ao carregar modelos face-api locais:', err);
      const CDN_URL = 'https://raw.githubusercontent.com/vladmandic/face-api/master/model';
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(CDN_URL),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(CDN_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(CDN_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(CDN_URL),
      ]);
      this.isFaceApiLoaded = true;
    }
  }

  public detectLandmarksForVideo(video: HTMLVideoElement, timestampMs: number): FaceLandmarkerResult | null {
    if (!this.faceLandmarker || !video || video.readyState < 2) return null;
    try {
      return this.faceLandmarker.detectForVideo(video, timestampMs);
    } catch {
      return null;
    }
  }

  // Extrair vetor biométrico de 128 dimensões usando Face-API ResNet CNN
  // IMPORTANTE: .withFaceLandmarks(false) utiliza a rede completa faceLandmark68Net para
  // calcular o alinhamento de olhos com máxima estabilidade, eliminando o erro de rotação.
  public async extractFaceDescriptor(video: HTMLVideoElement): Promise<Float32Array | null> {
    if (!this.isFaceApiLoaded || !video || video.readyState < 2) return null;

    try {
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.38 }))
        .withFaceLandmarks(false) // false = faceLandmark68Net de alta precisão
        .withFaceDescriptor();

      if (detection && detection.descriptor && detection.descriptor.length === 128) {
        return detection.descriptor;
      }
      return null;
    } catch (err) {
      console.warn('Erro ao extrair descriptor facial:', err);
      return null;
    }
  }

  // Distância Euclidiana entre dois vetores de 128D usando cálculo padronizado
  public computeEuclideanDistance(vecA: number[] | Float32Array, vecB: number[] | Float32Array): number {
    if (!vecA || !vecB || vecA.length !== 128 || vecB.length !== 128) {
      console.warn('[FaceID] Vetores incompatíveis na distância euclidiana:', vecA?.length, vecB?.length);
      return 1.0;
    }
    return faceapi.euclideanDistance(vecA, vecB);
  }

  // Calcular similaridade percentual calibrada (0% - 100%)
  public distanceToSimilarityPercent(distance: number): number {
    if (distance <= 0) return 100;
    if (distance >= 0.90) return 0;
    const similarity = (1 - distance / 0.82) * 100;
    return Math.max(0, Math.min(100, Math.round(similarity)));
  }

  // Avaliação biométrica comparando rosto atual com perfil cadastrado
  public evaluateFaceMatch(
    currentDescriptor: Float32Array,
    profile: FaceProfile,
    settings: BiometricSettings
  ): FaceMatchEvaluation {
    if (!profile || !profile.samples || profile.samples.length === 0) {
      return {
        isMatch: false,
        distance: 1.0,
        similarityScore: 0,
        threshold: settings.similarityThreshold,
        consecutiveMatches: 0,
        requiredMatches: settings.consecutiveFramesRequired,
        confidenceGrade: 'FAILED',
      };
    }

    let minDistance = 1.0;
    let closestSampleName = '';

    // Comparar contra cada amostra registrada no perfil (frontal, ângulos, etc.)
    for (const sample of profile.samples) {
      if (!sample.descriptor || sample.descriptor.length !== 128) continue;
      const dist = this.computeEuclideanDistance(currentDescriptor, sample.descriptor);
      if (dist < minDistance) {
        minDistance = dist;
        closestSampleName = sample.stepName || sample.angle;
      }
    }

    // Também comparar com a média ponderada do descritor se presente
    if (profile.averageDescriptor && profile.averageDescriptor.length === 128) {
      const avgDist = this.computeEuclideanDistance(currentDescriptor, profile.averageDescriptor);
      if (avgDist < minDistance) {
        minDistance = avgDist;
        closestSampleName = 'media_ponderada';
      }
    }

    const similarity = this.distanceToSimilarityPercent(minDistance);
    const isFrameMatch = minDistance <= settings.similarityThreshold;

    const now = performance.now();
    if (isFrameMatch) {
      if (now - this.lastMatchTimestamp < 1200) {
        this.consecutiveMatchesCount += 1;
      } else {
        this.consecutiveMatchesCount = 1;
      }
      this.lastMatchTimestamp = now;
    } else {
      // Diminui gradualmente para tolerar pequenos glitches sem zerar instantaneamente
      this.consecutiveMatchesCount = Math.max(0, this.consecutiveMatchesCount - 1);
    }

    let confidenceGrade: FaceMatchEvaluation['confidenceGrade'] = 'FAILED';
    if (minDistance <= 0.40) confidenceGrade = 'EXCELLENT';
    else if (minDistance <= 0.48) confidenceGrade = 'HIGH';
    else if (minDistance <= settings.similarityThreshold) confidenceGrade = 'MODERATE';
    else if (minDistance <= settings.similarityThreshold + 0.1) confidenceGrade = 'LOW';

    const isMatch = this.consecutiveMatchesCount >= settings.consecutiveFramesRequired;

    console.log('[FaceID Diagnostic]', {
      titular: profile.name,
      amostrasTotal: profile.samples.length,
      amostraMaisProxima: closestSampleName,
      distancia: Number(minDistance.toFixed(4)),
      limiar: settings.similarityThreshold,
      compativel: isFrameMatch,
      progressoQuadros: `${this.consecutiveMatchesCount}/${settings.consecutiveFramesRequired}`,
      autorizado: isMatch,
    });

    return {
      isMatch,
      distance: Number(minDistance.toFixed(4)),
      similarityScore: similarity,
      threshold: settings.similarityThreshold,
      consecutiveMatches: this.consecutiveMatchesCount,
      requiredMatches: settings.consecutiveFramesRequired,
      confidenceGrade,
    };
  }

  public resetConsecutiveMatches(): void {
    this.consecutiveMatchesCount = 0;
    this.lastMatchTimestamp = 0;
  }

  // Avaliar qualidade de enquadramento, iluminação e posição
  public assessQuality(
    video: HTMLVideoElement,
    landmarksResult: FaceLandmarkerResult | null
  ): QualityMetrics {
    const details: string[] = [];
    if (!landmarksResult || !landmarksResult.faceLandmarks || landmarksResult.faceLandmarks.length === 0) {
      return {
        isCentered: false,
        isGoodSize: false,
        isGoodLighting: false,
        score: 0,
        details: ['Nenhum rosto detectado na cena.'],
      };
    }

    const landmarks = landmarksResult.faceLandmarks[0];
    const nose = landmarks[1]; // Nariz central
    const chin = landmarks[152];
    const forehead = landmarks[10];

    // 1. Centralização (o nariz deve estar próximo a 0.5 horizontal e vertical)
    const isCenteredX = nose.x >= 0.35 && nose.x <= 0.65;
    const isCenteredY = nose.y >= 0.30 && nose.y <= 0.70;
    const isCentered = isCenteredX && isCenteredY;
    if (!isCentered) details.push('Centralize seu rosto no círculo ou moldura.');

    // 2. Tamanho do rosto no quadro (distância testa-queixo relativa)
    const faceHeight = Math.abs(chin.y - forehead.y);
    const isGoodSize = faceHeight >= 0.28 && faceHeight <= 0.72;
    if (faceHeight < 0.28) details.push('Aproxime-se um pouco mais da câmera.');
    if (faceHeight > 0.72) details.push('Afaste-se um pouco da câmera.');

    // 3. Iluminação estimada usando dimensões do vídeo
    const hasValidVideoDimensions = video.videoWidth > 0 && video.videoHeight > 0;
    const isGoodLighting = hasValidVideoDimensions;

    let score = 30;
    if (isCentered) score += 35;
    if (isGoodSize) score += 35;

    return {
      isCentered,
      isGoodSize,
      isGoodLighting,
      score,
      details,
    };
  }

  // Cálculo de vivacidade (Liveness) & Pose da Cabeça
  public computeLiveness(landmarksResult: FaceLandmarkerResult | null): LivenessState {
    if (!landmarksResult || !landmarksResult.faceLandmarks || landmarksResult.faceLandmarks.length === 0) {
      return this.livenessState;
    }

    const landmarks = landmarksResult.faceLandmarks[0];
    const nose = landmarks[1];
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];
    const chin = landmarks[152];
    const forehead = landmarks[10];

    // Estimativa de Yaw (rotação horizontal da cabeça em graus)
    const distLeft = Math.abs(nose.x - leftCheek.x);
    const distRight = Math.abs(rightCheek.x - nose.x);
    const totalDistX = distLeft + distRight;
    const yaw = totalDistX > 0 ? ((distLeft - distRight) / totalDistX) * 75 : 0;

    // Estimativa de Pitch (inclinação para cima/baixo em graus)
    const distTop = Math.abs(nose.y - forehead.y);
    const distBottom = Math.abs(chin.y - nose.y);
    const totalDistY = distTop + distBottom;
    const pitch = totalDistY > 0 ? ((distTop - distBottom) / totalDistY) * 60 : 0;

    // Detecção de piscada via blendshapes do MediaPipe (índices eyeBlinkLeft, eyeBlinkRight)
    let isBlinking = false;
    if (landmarksResult.faceBlendshapes && landmarksResult.faceBlendshapes[0]) {
      const blendshapes = landmarksResult.faceBlendshapes[0].categories;
      const blinkLeft = blendshapes.find((c) => c.categoryName === 'eyeBlinkLeft')?.score || 0;
      const blinkRight = blendshapes.find((c) => c.categoryName === 'eyeBlinkRight')?.score || 0;
      if (blinkLeft > 0.42 && blinkRight > 0.42) {
        isBlinking = true;
      }
    }

    const now = performance.now();
    let blinkCount = this.livenessState.blinkCount;
    if (isBlinking && !this.livenessState.isBlinking) {
      blinkCount += 1;
      this.livenessState.lastBlinkTime = now;
    }

    this.livenessState = {
      blinkCount,
      lastBlinkTime: this.livenessState.lastBlinkTime,
      isBlinking,
      yawDegrees: Math.round(yaw),
      pitchDegrees: Math.round(pitch),
      rollDegrees: 0,
      livenessPassed: blinkCount >= 1 || Math.abs(yaw) > 15,
    };

    return this.livenessState;
  }

  public resetLiveness(): void {
    this.livenessState = {
      blinkCount: 0,
      lastBlinkTime: 0,
      isBlinking: false,
      yawDegrees: 0,
      pitchDegrees: 0,
      rollDegrees: 0,
      livenessPassed: false,
    };
  }

  // Gerenciamento de Perfil no Armazenamento Local e Supabase
  public getStoredProfile(): FaceProfile | null {
    try {
      const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as FaceProfile;
    } catch {
      return null;
    }
  }

  /**
   * Busca o perfil biométrico persistido no banco de dados Supabase
   */
  public async fetchProfileFromSupabase(): Promise<FaceProfile | null> {
    if (!isSupabaseConfigured) return this.getStoredProfile();

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      let query = supabase.from('profiles').select('*');

      if (session?.user?.id) {
        query = query.eq('id', session.user.id);
      } else {
        query = query.order('updated_at', { ascending: false }).limit(1);
      }

      const { data, error } = await query;

      if (error) {
        console.warn('[FaceID Supabase] Consulta ao banco retornou aviso/erro:', error.message);
        return this.getStoredProfile();
      }

      if (data && data.length > 0) {
        const row = data[0];
        if (row.average_descriptor) {
          const remoteProfile: FaceProfile = {
            id: row.id,
            name: row.full_name || 'Proprietário Autorizado',
            role: row.role || 'System Administrator & Root Owner',
            createdAt: row.created_at || new Date().toISOString(),
            samples: Array.isArray(row.samples) ? row.samples : [],
            averageDescriptor: Array.isArray(row.average_descriptor) ? row.average_descriptor : [],
            livenessVerified: row.liveness_verified ?? true,
          };
          localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(remoteProfile));
          return remoteProfile;
        }
      }

      return null;
    } catch (err) {
      console.warn('[FaceID Supabase] Falha ao consultar Supabase (usando cache local):', err);
      return this.getStoredProfile();
    }
  }

  /**
   * Verifica a correspondência facial com o servidor Supabase via RPC verify_face_match.
   * Não expõe os descritores biométricos ao cliente.
   */
  public async verifyFaceWithServer(
    descriptor: number[],
    threshold: number = 0.58
  ): Promise<{
    matched: boolean;
    user_id?: string;
    full_name?: string;
    role?: string;
    distance?: number;
    similarity?: number;
    message?: string;
  }> {
    if (!isSupabaseConfigured) {
      return { matched: false, message: 'Supabase não configurado' };
    }

    try {
      const { data, error } = await supabase.rpc('verify_face_match', {
        candidate_descriptor: descriptor,
        threshold: threshold,
        device_info: navigator.userAgent || 'Web Browser',
        ip_address: 'Client Direct',
      });

      if (error) {
        console.warn('[FaceID Supabase RPC] Erro na função verify_face_match:', error.message);
        return { matched: false, message: error.message };
      }

      return data as {
        matched: boolean;
        user_id?: string;
        full_name?: string;
        role?: string;
        distance?: number;
        similarity?: number;
        message?: string;
      };
    } catch (err: any) {
      console.warn('[FaceID Supabase RPC] Falha de comunicação com RPC:', err);
      return { matched: false, message: err?.message || 'Falha de rede' };
    }
  }

  /**
   * Salva o perfil biométrico sincronizando com Supabase e localStorage.
   * Cria/vincula a conta em auth.users para respeitar as chaves estrangeiras.
   */
  public async saveProfile(
    name: string,
    samples: FaceSample[],
    authCredentials?: { email?: string; password?: string }
  ): Promise<FaceProfile> {
    const sampleLength = samples[0]?.descriptor.length || 128;
    const avg = new Array(sampleLength).fill(0);

    samples.forEach((s) => {
      s.descriptor.forEach((val, i) => {
        avg[i] += val;
      });
    });

    for (let i = 0; i < sampleLength; i++) {
      avg[i] /= samples.length;
    }

    // Normalização L2
    const norm = Math.sqrt(avg.reduce((acc, v) => acc + v * v, 0)) || 1;
    const normalizedAvg = avg.map((v) => v / norm);

    let profileId = generateUUID();

    // 1. Integrar com Supabase Auth para obter UUID legítimo em auth.users
    if (isSupabaseConfigured) {
      try {
        let activeSession = (await supabase.auth.getSession()).data.session;

        // Se o usuário informou e-mail e senha e não está logado, cadastra ou autentica
        if (!activeSession && authCredentials?.email && authCredentials?.password) {
          const signUpRes = await supabase.auth.signUp({
            email: authCredentials.email,
            password: authCredentials.password,
            options: {
              data: { full_name: name },
            },
          });

          if (signUpRes.data?.user) {
            profileId = signUpRes.data.user.id;
          } else if (signUpRes.error?.message?.toLowerCase().includes('already registered')) {
            // Se já registrado, tenta autenticar com a senha informada
            const signInRes = await supabase.auth.signInWithPassword({
              email: authCredentials.email,
              password: authCredentials.password,
            });
            if (signInRes.data?.user) {
              profileId = signInRes.data.user.id;
            }
          }
        } else if (activeSession?.user?.id) {
          profileId = activeSession.user.id;
        }
      } catch (authErr) {
        console.warn('[FaceID Supabase] Processo de autenticação prévio:', authErr);
      }
    }

    const profile: FaceProfile = {
      id: profileId,
      name: name.trim() || 'Usuário Cadastrado',
      role: 'user', // Default 'user' (sem privilégios de administrador por padrão)
      createdAt: new Date().toISOString(),
      samples,
      averageDescriptor: normalizedAvg,
      livenessVerified: true,
    };

    // Cache local imediato
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));

    // 2. Persistir no Supabase (profiles e face_registrations)
    if (isSupabaseConfigured) {
      console.log('[FaceID Supabase] Enviando perfil para a tabela profiles...');
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: profile.id,
            full_name: profile.name,
            role: profile.role,
            average_descriptor: profile.averageDescriptor,
            samples: profile.samples,
            liveness_verified: profile.livenessVerified,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );

      if (profileError) {
        console.error('[FaceID Supabase] Erro ao gravar perfil:', profileError);
        throw new Error(`Falha no banco Supabase: ${profileError.message}`);
      }

      // Registrar status na tabela face_registrations
      try {
        await supabase.from('face_registrations').upsert(
          {
            user_id: profile.id,
            status: 'active',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );
      } catch (regErr) {
        console.warn('[FaceID Supabase] Aviso ao registrar em face_registrations:', regErr);
      }

      console.log('[FaceID Supabase] Perfil e registro biométrico salvos com sucesso!');
    }

    return profile;
  }

  /**
   * Salva o perfil apenas localmente em caso de fallback
   */
  public saveProfileLocally(name: string, samples: FaceSample[]): FaceProfile {
    const sampleLength = samples[0]?.descriptor.length || 128;
    const avg = new Array(sampleLength).fill(0);

    samples.forEach((s) => {
      s.descriptor.forEach((val, i) => {
        avg[i] += val;
      });
    });

    for (let i = 0; i < sampleLength; i++) {
      avg[i] /= samples.length;
    }

    const norm = Math.sqrt(avg.reduce((acc, v) => acc + v * v, 0)) || 1;
    const normalizedAvg = avg.map((v) => v / norm);

    const profile: FaceProfile = {
      id: generateUUID(),
      name: name.trim() || 'Usuário Cadastrado',
      role: 'user',
      createdAt: new Date().toISOString(),
      samples,
      averageDescriptor: normalizedAvg,
      livenessVerified: true,
    };

    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    return profile;
  }

  public async deleteProfile(): Promise<void> {
    const current = this.getStoredProfile();
    if (current?.id && isSupabaseConfigured) {
      try {
        await supabase.from('face_registrations').delete().eq('user_id', current.id);
        const { error } = await supabase.from('profiles').delete().eq('id', current.id);
        if (error) {
          console.warn('[FaceID Supabase] Erro ao deletar do Supabase:', error.message);
        } else {
          console.log('[FaceID Supabase] Perfil removido do Supabase com sucesso.');
        }
      } catch (err) {
        console.warn('[FaceID Supabase] Exceção ao deletar perfil do banco:', err);
      }
    }

    localStorage.removeItem(PROFILE_STORAGE_KEY);
    this.resetConsecutiveMatches();
  }

  // Logs de Auditoria de Segurança
  public getAuditLogs(): SecurityAuditEntry[] {
    try {
      const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as SecurityAuditEntry[];
    } catch {
      return [];
    }
  }

  public async addAuditLog(entry: Omit<SecurityAuditEntry, 'id' | 'timestamp'>): Promise<void> {
    const logs = this.getAuditLogs();
    const newEntry: SecurityAuditEntry = {
      ...entry,
      id: 'log_' + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
    };
    logs.unshift(newEntry);
    if (logs.length > 50) logs.pop(); // Manter últimos 50 eventos
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(logs));

    if (isSupabaseConfigured) {
      try {
        await supabase.from('security_audit_logs').insert([
          {
            status: entry.status,
            user_name: entry.userName,
            similarity: entry.similarity,
            distance: entry.distance,
            liveness_score: entry.livenessScore,
            ip_mock: entry.ipMock,
            device_info: entry.deviceInfo,
            timestamp: newEntry.timestamp,
          },
        ]);
      } catch {
        // Tabela de auditoria opcional
      }
    }
  }

  public async clearAuditLogs(): Promise<void> {
    localStorage.removeItem(AUDIT_STORAGE_KEY);
    if (isSupabaseConfigured) {
      try {
        await supabase
          .from('security_audit_logs')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
      } catch {
        // Silencioso se tabela não existir
      }
    }
  }

  /**
   * Diagnóstico do status de conexão com o Supabase
   */
  public async checkSupabaseHealth(): Promise<{
    configured: boolean;
    connected: boolean;
    tableReady: boolean;
    message: string;
    details?: string;
  }> {
    if (!isSupabaseConfigured) {
      return {
        configured: false,
        connected: false,
        tableReady: false,
        message: 'Variáveis VITE_SUPABASE_URL ou VITE_SUPABASE_PUBLISHABLE_KEY não configuradas.',
      };
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .select('id, full_name, average_descriptor')
        .limit(1);

      if (!error) {
        return {
          configured: true,
          connected: true,
          tableReady: true,
          message: 'Conectado ao Supabase com tabela profiles pronta para biometria.',
        };
      }

      if (error.code === '42703') {
        return {
          configured: true,
          connected: true,
          tableReady: false,
          message: 'Tabela profiles existe, mas faltam as colunas biométricas (execute a migration SQL).',
          details: error.message,
        };
      }

      if (error.code === '42501') {
        return {
          configured: true,
          connected: true,
          tableReady: false,
          message: 'Conectado ao Supabase, mas a política de RLS bloqueou o acesso.',
          details: error.message,
        };
      }

      return {
        configured: true,
        connected: false,
        tableReady: false,
        message: `Aviso do Supabase: ${error.message}`,
        details: error.details,
      };
    } catch (err: any) {
      return {
        configured: true,
        connected: false,
        tableReady: false,
        message: `Falha de rede ao conectar com Supabase: ${err?.message || err}`,
      };
    }
  }

  // Configurações Biométricas
  public getSettings(): BiometricSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return DEFAULT_SETTINGS;
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  public saveSettings(settings: BiometricSettings): void {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }
}

export const faceService = new FaceRecognitionService();
