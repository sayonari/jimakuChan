// Chrome 138+ Translation API を使用した翻訳機能（改善版）
// エラーハンドリングとリトライ機能を追加

class ChromeTranslatorV2 {
    constructor() {
        this.translators = new Map();
        this.detector = null;
        this.isAvailable = false;
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1秒
        this.lastTranslationTime = new Map(); // レート制限用
        this.minTranslationInterval = 100; // 最小翻訳間隔（ミリ秒）
        this.downloadingModels = new Set(); // ダウンロード中のモデルを追跡
        this.onDownloadStatusChange = null; // ダウンロード状態変更時のコールバック
        this.cleanupTimer = null; // 定期クリーンアップタイマー
        this.translationCount = 0; // 翻訳回数カウンター
        this.maxTranslationsBeforeCleanup = 1000; // クリーンアップ実行の翻訳回数閾値
        
        // 定期的なメモリクリーンアップを開始（30分間隔）
        this.startPeriodicCleanup();
        
        // 翻訳モデルサイズのデータ（MB単位）
        // 2025年8月時点の実測値に基づく（各モデル約1.5〜2GB）
        this.modelSizes = {
            "ja_en": 1800, "en_ja": 1800,  // 日本語↔英語 約1.8GB
            "ja_ko": 1700, "ko_ja": 1700,  // 日本語↔韓国語 約1.7GB
            "ja_zh": 1900, "zh_ja": 1900,  // 日本語↔中国語 約1.9GB
            "ja_fr": 1600, "fr_ja": 1600,  // 日本語↔フランス語 約1.6GB
            "ja_de": 1600, "de_ja": 1600,  // 日本語↔ドイツ語 約1.6GB
            "ja_es": 1700, "es_ja": 1700,  // 日本語↔スペイン語 約1.7GB
            "ja_it": 1600, "it_ja": 1600,  // 日本語↔イタリア語 約1.6GB
            "ja_pt": 1600, "pt_ja": 1600,  // 日本語↔ポルトガル語 約1.6GB
            "ja_ru": 1700, "ru_ja": 1700,  // 日本語↔ロシア語 約1.7GB
            "ja_ar": 1800, "ar_ja": 1800,  // 日本語↔アラビア語 約1.8GB
            "ja_th": 1700, "th_ja": 1700,  // 日本語↔タイ語 約1.7GB
            "ja_vi": 1500, "vi_ja": 1500,  // 日本語↔ベトナム語 約1.5GB
            "ja_id": 1500, "id_ja": 1500,  // 日本語↔インドネシア語 約1.5GB
            "ja_nl": 1600, "nl_ja": 1600,  // 日本語↔オランダ語 約1.6GB
            "ja_pl": 1600, "pl_ja": 1600,  // 日本語↔ポーランド語 約1.6GB
            "ja_tr": 1500, "tr_ja": 1500,  // 日本語↔トルコ語 約1.5GB
            "ja_sv": 1600, "sv_ja": 1600,  // 日本語↔スウェーデン語 約1.6GB
            "ja_uk": 1700, "uk_ja": 1700,  // 日本語↔ウクライナ語 約1.7GB
            "ja_el": 1600, "el_ja": 1600,  // 日本語↔ギリシャ語 約1.6GB
            "en_ko": 1700, "ko_en": 1700,  // 英語↔韓国語 約1.7GB
            "en_zh": 2000, "zh_en": 2000,  // 英語↔中国語 約2.0GB（最大級）
            "en_fr": 1600, "fr_en": 1600,  // 英語↔フランス語 約1.6GB
            "en_de": 1600, "de_en": 1600,  // 英語↔ドイツ語 約1.6GB
            "en_es": 1700, "es_en": 1700,  // 英語↔スペイン語 約1.7GB
            "en_it": 1600, "it_en": 1600,  // 英語↔イタリア語 約1.6GB
            "en_pt": 1600, "pt_en": 1600,  // 英語↔ポルトガル語 約1.6GB
            "en_ru": 1700, "ru_en": 1700,  // 英語↔ロシア語 約1.7GB
            "en_ar": 1800, "ar_en": 1800,  // 英語↔アラビア語 約1.8GB
            "en_th": 1700, "th_en": 1700,  // 英語↔タイ語 約1.7GB
            "en_vi": 1500, "vi_en": 1500,  // 英語↔ベトナム語 約1.5GB
            "en_id": 1500, "id_en": 1500,  // 英語↔インドネシア語 約1.5GB
            "en_nl": 1600, "nl_en": 1600,  // 英語↔オランダ語 約1.6GB
            "ko_zh": 1800, "zh_ko": 1800,  // 韓国語↔中国語 約1.8GB
            "fr_de": 1600, "de_fr": 1600,  // フランス語↔ドイツ語 約1.6GB
            "es_pt": 1500, "pt_es": 1500   // スペイン語↔ポルトガル語 約1.5GB
        };
        this.defaultModelSize = 1600; // 未知の言語ペアのデフォルトサイズ（MB）約1.6GB
        
        this.checkAvailability();
    }
    
    // モデルサイズを取得
    getModelSize(sourceLang, targetLang) {
        const key = `${sourceLang}_${targetLang}`;
        return this.modelSizes[key] || this.defaultModelSize;
    }

    // APIの利用可能性をチェック
    async checkAvailability() {
        try {
            // Translation API が利用可能かチェック
            if (!('Translator' in self)) {
                console.log('Chrome Translator API は利用できません（Chrome 138+が必要）');
                this.isAvailable = false;
                return false;
            }

            console.log('Chrome Translator API が利用可能です');
            this.isAvailable = true;
            
            // 言語検出器の初期化も試みる
            if ('LanguageDetector' in self) {
                try {
                    this.detector = await LanguageDetector.create();
                    console.log('言語検出器を初期化しました');
                } catch (error) {
                    console.warn('言語検出器の初期化に失敗（オプション機能）:', error);
                }
            }
            
            return true;
        } catch (error) {
            console.error('Chrome Translation API チェックエラー:', error);
            this.isAvailable = false;
            return false;
        }
    }

    // 言語検出
    async detectLanguage(text) {
        if (!this.detector) {
            console.warn('言語検出器が利用できません');
            return null;
        }
        
        try {
            const detection = await this.detector.detect(text.trim());
            if (detection && detection.length > 0) {
                const { detectedLanguage, confidence } = detection[0];
                console.log(`言語検出: ${detectedLanguage} (信頼度: ${(confidence * 100).toFixed(1)}%)`);
                return detectedLanguage;
            }
            return null;
        } catch (error) {
            console.error('言語検出エラー:', error);
            return null;
        }
    }

    // 翻訳可能性をチェック
    async canTranslate(sourceLang, targetLang) {
        if (!this.isAvailable) {
            return false;
        }
        
        try {
            const availability = await Translator.availability({
                sourceLanguage: sourceLang,
                targetLanguage: targetLang
            });
            
            console.log(`翻訳可能性 (${sourceLang} → ${targetLang}): ${availability}`);
            // 'available' または 'downloadable' の場合は翻訳可能
            return availability === 'available' || availability === 'downloadable';
        } catch (error) {
            console.error(`翻訳可能性チェックエラー (${sourceLang} → ${targetLang}):`, error);
            return false;
        }
    }

    // レート制限チェック
    async waitForRateLimit(key) {
        const lastTime = this.lastTranslationTime.get(key);
        if (lastTime) {
            const elapsed = Date.now() - lastTime;
            if (elapsed < this.minTranslationInterval) {
                const waitTime = this.minTranslationInterval - elapsed;
                console.log(`レート制限: ${waitTime}ms待機`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
        this.lastTranslationTime.set(key, Date.now());
    }

    // 翻訳器を作成または取得（リトライ機能付き）
    async getTranslator(sourceLang, targetLang, retryCount = 0) {
        const key = `${sourceLang}_${targetLang}`;
        
        // キャッシュされた翻訳器があれば返す
        if (this.translators.has(key)) {
            const translator = this.translators.get(key);
            // 翻訳器が正常か確認
            try {
                // 簡単なテストで翻訳器の状態を確認
                if (translator && typeof translator.translate === 'function') {
                    return translator;
                }
            } catch (error) {
                console.warn('キャッシュされた翻訳器が無効です。再作成します。');
                this.translators.delete(key);
            }
        }

        try {
            // 翻訳可能性を確認
            const availability = await Translator.availability({
                sourceLanguage: sourceLang,
                targetLanguage: targetLang
            });
            
            if (availability !== 'available' && availability !== 'downloadable') {
                throw new Error(`翻訳不可: ${sourceLang} → ${targetLang} (availability: ${availability})`);
            }
            
            // ダウンロードが必要な場合は通知
            if (availability === 'downloadable') {
                console.log(`翻訳モデルのダウンロードが必要: ${sourceLang} → ${targetLang}`);
                this.downloadingModels.add(key);
                if (this.onDownloadStatusChange) {
                    this.onDownloadStatusChange({
                        status: 'downloading',
                        sourceLang: sourceLang,
                        targetLang: targetLang,
                        progress: 0,
                        message: `翻訳モデル(${this.getLanguageName(sourceLang)}→${this.getLanguageName(targetLang)})をダウンロード開始...`
                    });
                }
            }
            
            console.log(`Chrome 翻訳器を作成中: ${sourceLang} → ${targetLang}`);
            
            // 翻訳器作成オプション
            const createOptions = {
                sourceLanguage: sourceLang,
                targetLanguage: targetLang
            };
            
            // ダウンロードが必要な場合のみmonitorを設定
            if (availability === 'downloadable') {
                createOptions.monitor = (m) => {
                    // モデルサイズを取得
                    const estimatedSize = this.getModelSize(sourceLang, targetLang);
                    
                    // ダウンロード進捗を監視
                    m.addEventListener('downloadprogress', (e) => {
                        const percentage = Math.round(e.loaded * 100);
                        console.log(`ダウンロード進捗: ${percentage}%`);
                        
                        if (this.onDownloadStatusChange) {
                            this.onDownloadStatusChange({
                                status: 'downloading',
                                sourceLang: sourceLang,
                                targetLang: targetLang,
                                progress: percentage,
                                message: `翻訳モデル(${this.getLanguageName(sourceLang)}→${this.getLanguageName(targetLang)})をダウンロード中... ${percentage}%`
                            });
                        }
                    });
                };
            }
            
            const translator = await Translator.create(createOptions);
            
            // ダウンロード完了を通知
            if (this.downloadingModels.has(key)) {
                this.downloadingModels.delete(key);
                if (this.onDownloadStatusChange) {
                    this.onDownloadStatusChange({
                        status: 'completed',
                        sourceLang: sourceLang,
                        targetLang: targetLang,
                        message: `翻訳モデル(${this.getLanguageName(sourceLang)}→${this.getLanguageName(targetLang)})の準備完了！`
                    });
                }
            }

            // キャッシュに保存
            this.translators.set(key, translator);
            console.log(`翻訳器作成完了: ${sourceLang} → ${targetLang}`);
            
            return translator;

        } catch (error) {
            console.error(`翻訳器作成エラー (${sourceLang} → ${targetLang}):`, error);
            
            // リトライ
            if (retryCount < this.maxRetries) {
                console.log(`翻訳器作成をリトライします (${retryCount + 1}/${this.maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                return this.getTranslator(sourceLang, targetLang, retryCount + 1);
            }
            
            throw error;
        }
    }

    // テキストを翻訳（リトライ機能付き）
    async translate(text, sourceLang, targetLang, retryCount = 0) {
        if (!this.isAvailable) {
            throw new Error('Chrome Translation API は利用できません');
        }

        if (!text || text.trim() === '') {
            return '';
        }

        const key = `${sourceLang}_${targetLang}`;

        try {
            // レート制限を適用
            await this.waitForRateLimit(key);
            
            // ソース言語が'auto'の場合は言語検出を使用
            if (sourceLang === 'auto' && this.detector) {
                const detected = await this.detectLanguage(text);
                if (detected) {
                    sourceLang = detected;
                    console.log(`言語を自動検出: ${detected}`);
                } else {
                    // 検出できない場合はデフォルトで英語と仮定
                    sourceLang = 'en';
                    console.warn('言語検出失敗、英語と仮定します');
                }
            }
            
            // 同じ言語の場合はそのまま返す
            if (sourceLang === targetLang) {
                return text;
            }
            
            // 翻訳器を取得
            const translator = await this.getTranslator(sourceLang, targetLang);
            
            // 翻訳実行
            const startTime = performance.now();
            const result = await translator.translate(text.trim());
            const endTime = performance.now();
            
            console.log(`翻訳完了 (${Math.round(endTime - startTime)}ms): ${text.substring(0, 50)}... → ${result.substring(0, 50)}...`);
            
            // 翻訳回数をカウント
            this.translationCount++;
            
            // 一定回数ごとにメモリクリーンアップを実行
            if (this.translationCount % this.maxTranslationsBeforeCleanup === 0) {
                console.log(`${this.translationCount}回翻訳完了。メモリクリーンアップを実行します。`);
                // 非同期でクリーンアップを実行（翻訳処理をブロックしない）
                setTimeout(() => this.performMemoryCleanup(), 100);
            }
            
            return result;
            
        } catch (error) {
            console.error(`翻訳エラー (リトライ ${retryCount}/${this.maxRetries}):`, error);
            
            // "Other generic failures occurred" エラーの場合はリトライ
            if (error.name === 'UnknownError' && retryCount < this.maxRetries) {
                console.log(`翻訳をリトライします (${retryCount + 1}/${this.maxRetries})`);
                
                // 翻訳器をリセット
                const key = `${sourceLang}_${targetLang}`;
                if (this.translators.has(key)) {
                    const oldTranslator = this.translators.get(key);
                    this.translators.delete(key);
                    // 古い翻訳器をクリーンアップ
                    if (oldTranslator && typeof oldTranslator.destroy === 'function') {
                        try {
                            await oldTranslator.destroy();
                        } catch (e) {
                            console.warn('翻訳器のクリーンアップに失敗:', e);
                        }
                    }
                }
                
                // 待機時間を増やしながらリトライ
                await new Promise(resolve => setTimeout(resolve, this.retryDelay * (retryCount + 1)));
                return this.translate(text, sourceLang, targetLang, retryCount + 1);
            }
            
            throw error;
        }
    }

    // 言語パックを事前ダウンロード（翻訳せずにモデルだけダウンロード）
    async preloadLanguagePack(sourceLang, targetLang) {
        if (!this.isAvailable) {
            throw new Error('Chrome Translation API は利用できません');
        }
        
        try {
            // 言語コードを正規化
            sourceLang = this.normalizeLanguageCode(sourceLang);
            targetLang = this.normalizeLanguageCode(targetLang);
            
            // 翻訳可能性をチェック
            const availability = await Translator.availability({
                sourceLanguage: sourceLang,
                targetLanguage: targetLang
            });
            
            console.log(`事前ダウンロード確認 (${sourceLang} → ${targetLang}): ${availability}`);
            
            if (availability === 'available') {
                console.log(`モデルは既にダウンロード済みです: ${sourceLang} → ${targetLang}`);
                if (this.onDownloadStatusChange) {
                    this.onDownloadStatusChange({
                        status: 'completed',
                        sourceLang: sourceLang,
                        targetLang: targetLang,
                        progress: 100,
                        message: `翻訳モデル(${this.getLanguageName(sourceLang)}→${this.getLanguageName(targetLang)})は既に利用可能です`
                    });
                }
                return true;
            }
            
            if (availability === 'downloadable') {
                console.log(`モデルをダウンロードします: ${sourceLang} → ${targetLang}`);
                
                // ダウンロード開始を通知
                if (this.onDownloadStatusChange) {
                    this.onDownloadStatusChange({
                        status: 'downloading',
                        sourceLang: sourceLang,
                        targetLang: targetLang,
                        progress: 0,
                        message: `翻訳モデル(${this.getLanguageName(sourceLang)}→${this.getLanguageName(targetLang)})のダウンロードを開始...`
                    });
                }
                
                // 翻訳器を作成（これによりモデルがダウンロードされる）
                await this.getTranslator(sourceLang, targetLang);
                
                return true;
            }
            
            console.warn(`モデルは利用できません: ${sourceLang} → ${targetLang} (${availability})`);
            return false;
            
        } catch (error) {
            console.error(`事前ダウンロードエラー (${sourceLang} → ${targetLang}):`, error);
            if (this.onDownloadStatusChange) {
                this.onDownloadStatusChange({
                    status: 'error',
                    sourceLang: sourceLang,
                    targetLang: targetLang,
                    message: `ダウンロードエラー: ${error.message}`
                });
            }
            throw error;
        }
    }

    // バッチ翻訳（複数のテキストを効率的に翻訳）
    async translateBatch(texts, sourceLang, targetLang) {
        if (!Array.isArray(texts)) {
            texts = [texts];
        }
        
        const results = [];
        const translator = await this.getTranslator(sourceLang, targetLang);
        
        for (const text of texts) {
            try {
                // レート制限を適用
                await this.waitForRateLimit(`${sourceLang}_${targetLang}`);
                const result = await translator.translate(text.trim());
                results.push(result);
            } catch (error) {
                console.error(`バッチ翻訳エラー (${text.substring(0, 30)}...):`, error);
                results.push(text); // エラー時は元のテキストを返す
            }
        }
        
        return results;
    }

    // 定期的なメモリクリーンアップを開始
    startPeriodicCleanup() {
        // 30分間隔でクリーンアップを実行
        this.cleanupTimer = setInterval(() => {
            this.performMemoryCleanup();
        }, 30 * 60 * 1000); // 30分
    }
    
    // メモリクリーンアップを実行
    async performMemoryCleanup() {
        console.log('定期メモリクリーンアップを実行中...');
        
        try {
            // 古い翻訳器を削除（最近使用されていないもの）
            const now = Date.now();
            const CLEANUP_THRESHOLD = 20 * 60 * 1000; // 20分間未使用なら削除
            
            const keysToRemove = [];
            for (const [key, translator] of this.translators) {
                const lastUsed = this.lastTranslationTime.get(key) || 0;
                if (now - lastUsed > CLEANUP_THRESHOLD) {
                    keysToRemove.push(key);
                }
            }
            
            // 古い翻訳器を削除
            for (const key of keysToRemove) {
                const translator = this.translators.get(key);
                if (translator && typeof translator.destroy === 'function') {
                    try {
                        await translator.destroy();
                    } catch (error) {
                        console.warn(`翻訳器削除エラー (${key}):`, error);
                    }
                }
                this.translators.delete(key);
                this.lastTranslationTime.delete(key);
                console.log(`古い翻訳器を削除: ${key}`);
            }
            
            // JavaScript のガベージコレクションを促す
            if (window.gc && typeof window.gc === 'function') {
                window.gc();
            }
            
            console.log(`メモリクリーンアップ完了。削除した翻訳器: ${keysToRemove.length}個`);
            
        } catch (error) {
            console.error('メモリクリーンアップエラー:', error);
        }
    }
    
    // リソースのクリーンアップ
    async cleanup() {
        // 定期クリーンアップタイマーを停止
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        
        // 翻訳器のクリーンアップ
        for (const [key, translator] of this.translators) {
            try {
                if (translator && typeof translator.destroy === 'function') {
                    await translator.destroy();
                }
            } catch (error) {
                console.error(`翻訳器クリーンアップエラー (${key}):`, error);
            }
        }
        this.translators.clear();
        this.lastTranslationTime.clear();
        
        // 言語検出器のクリーンアップ
        if (this.detector && typeof this.detector.destroy === 'function') {
            try {
                await this.detector.destroy();
            } catch (error) {
                console.error('言語検出器クリーンアップエラー:', error);
            }
        }
        this.detector = null;
    }

    // 翻訳器の状態をリセット（エラー回復用）
    async resetTranslator(sourceLang, targetLang) {
        const key = `${sourceLang}_${targetLang}`;
        
        if (this.translators.has(key)) {
            const translator = this.translators.get(key);
            this.translators.delete(key);
            
            if (translator && typeof translator.destroy === 'function') {
                try {
                    await translator.destroy();
                } catch (error) {
                    console.warn('翻訳器のリセット中にエラー:', error);
                }
            }
        }
        
        console.log(`翻訳器をリセットしました: ${sourceLang} → ${targetLang}`);
    }

    // 言語コードを正規化（jimakuChanの形式からChrome Translation APIの形式へ）
    normalizeLanguageCode(code) {
        const mapping = {
            'ja': 'ja',
            'ja-JP': 'ja',
            'en': 'en',
            'en-US': 'en',
            'ko': 'ko',
            'ko-KR': 'ko',
            'zh-CN': 'zh',       // 中国語簡体字
            'zh-TW': 'zh-Hant',  // 中国語繁体字
            'zh-HK': 'zh-Hant',  // 香港語（繁体字として扱う）
            'fr': 'fr',
            'fr-FR': 'fr',
            'it': 'it',
            'it-IT': 'it',
            'de': 'de',
            'de-DE': 'de',
            'tr': 'tr',
            'tr-TR': 'tr',
            'sv': 'sv',
            'sv-SE': 'sv',
            'pl': 'pl',
            'pl-PL': 'pl',
            'uk': 'uk',
            'uk-UA': 'uk',
            'ru': 'ru',
            'ru-RU': 'ru',
            'es': 'es',
            'es-ES': 'es',
            'pt': 'pt',
            'pt-PT': 'pt',
            'pt-BR': 'pt',
            'nl': 'nl',
            'nl-NL': 'nl',
            'id': 'id',
            'id-ID': 'id',
            'vi': 'vi',
            'vi-VN': 'vi',
            'th': 'th',
            'th-TH': 'th',
            'ar': 'ar',
            'ar-SA': 'ar',
            'so': 'so',
            'so-SO': 'so',
            'el': 'el',
            'el-GR': 'el'
        };
        
        return mapping[code] || code;
    }
    
    // 言語名を取得
    getLanguageName(code) {
        const languageNames = {
            'ja': '日本語',
            'en': '英語',
            'ko': '韓国語',
            'zh': '中国語',
            'zh-CN': '中国語(簡)',
            'zh-TW': '中国語(繁)',
            'zh-Hant': '中国語(繁)',
            'fr': 'フランス語',
            'de': 'ドイツ語',
            'es': 'スペイン語',
            'it': 'イタリア語',
            'pt': 'ポルトガル語',
            'ru': 'ロシア語',
            'ar': 'アラビア語',
            'th': 'タイ語',
            'vi': 'ベトナム語',
            'id': 'インドネシア語',
            'nl': 'オランダ語',
            'pl': 'ポーランド語',
            'tr': 'トルコ語',
            'sv': 'スウェーデン語',
            'uk': 'ウクライナ語',
            'so': 'ソマリ語',
            'el': 'ギリシャ語'
        };
        return languageNames[code] || code;
    }
}

// グローバルインスタンスを作成（既存のインスタンスがあれば置き換え）
if (window.chromeTranslator) {
    // 既存のインスタンスをクリーンアップ
    window.chromeTranslator.cleanup().catch(e => console.warn('既存の翻訳器のクリーンアップに失敗:', e));
}
window.chromeTranslator = new ChromeTranslatorV2();