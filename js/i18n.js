/**
 * i18n (Internationalization) System for jimakuChan
 * Supports Japanese (ja) and English (en)
 */

const i18n = {
    // Current language
    currentLang: 'ja',

    // Translation data
    translations: {
        ja: {
            // Page title
            pageTitle: "jimakuChan: 音声認識字幕ちゃん [CONFIG]",

            // Iframe instruction
            iframeInstruction: "上の画面をクリックすると設定画面が閉じ，もう一度押すと再度開きます．",

            // Preset section
            presetLabel: "設定プリセット：",
            presetDefault: "📋 選択してください",
            presetGaming: "🎮 ゲーム配信用",
            presetMeeting: "💼 会議・打ち合わせ用",
            presetLanguageLearning: "📚 語学学習用",
            presetAccessibility: "♿ アクセシビリティ重視",
            presetCuteStreaming: "🌸 かわいい配信用",
            presetDarkTheme: "🌙 ダークテーマ",
            presetRainbow: "🌈 レインボー",
            presetCustom1: "🔧 カスタム１",
            presetCustom2: "🔧 カスタム２",
            presetCustom3: "🔧 カスタム３",
            presetNote: "※ 選択すると設定が自動保存されます ✨",

            // API Key section
            apiKeyLabel: "翻訳用 Google API-KEY：",
            apiKeyHowTo: "[作成方法]",
            transCount: "翻訳回数：",
            transFreeLimit: "（無料上限5,000回）",
            transLabel: "翻訳：",
            transWaiting: "待機中",

            // Chrome Translation
            chromeTranslationDetected: "🚀 高速翻訳対応Chromeで起動されています",
            translationMethod: "翻訳方法：",
            chromeBuiltIn: "Chrome内蔵(高速)",
            gasApi: "GAS API",
            downloadModel: "📥 モデルをダウンロード",
            modelRemaining: "📦 残り0個",

            // Text settings table
            textColor: "文字色",
            borderColor: "フチ色",
            size: "サイズ",
            weight: "ウェイト",
            border: "縁取り",
            recognition: "認識　：",
            translation1: "翻訳１：",
            translation2: "翻訳２：",
            translation3: "翻訳３：",

            // Background color
            backgroundColor: "背景色：",

            // Recognition model
            recognitionModel: "音声認識モデル：",
            recogModelCloud: "クラウド（Google）",
            recogModelLocal: "ローカル（PC内で行う）",
            recogModelStatusAvailable: "✅ 利用可能",
            recogModelStatusDownloadable: "📥 要ダウンロード",
            recogModelStatusDownloading: "📥 ダウンロード中...",
            recogModelStatusUnavailable: "⚠ 利用不可",
            recogModelStatusChecking: "🔍 確認中...",
            recogModelStatusUnsupported: "⚠ 未対応（Chrome 138以降で利用可能）",
            recogModelDownloadBtn: "モデルをダウンロード",
            recogModelCloudWarn: "⚠ この PC にはこの言語のローカルモデルが入っています．Chrome の仕様で，クラウドを選んでもローカルで認識されることがあります．",
            recogModelGuideBtn: "詳しい人向け：ローカルモデルを消すには",
            recogModelCopyBtn: "コピー",
            recogModelCopied: "コピーしました．アドレスバーに貼り付けて開いてください",
            recogModelCopyFailed: "コピーできませんでした．上の文字列を手でコピーしてください",
            recogModelGuideStep1: "1) コピーしたアドレスを Chrome のアドレスバーに貼り付けて開く",
            recogModelGuideStep2: "2)「自動字幕起こし」をオンにする（オンにすると，インストール済みの言語の一覧が表示されます）",
            recogModelGuideStep3: "3) 一覧の言語をすべて削除する",
            recogModelGuideStep4: "4)「自動字幕起こし」をオフに戻し，Chrome を起動し直す",
            recogModelGuideWarn: "※ ローカルを選ぶと，モデルの再ダウンロードが必要になります．",
            recogModelEnMissing: "⚠ 英語モデルが無いと認識結果が返らないことがあります．",
            recogModelEnInstallBtn: "英語モデルも取得",
            recogNoResultWarn: "音は届いていますが，認識結果が返ってきません．英語モデルが入っていないと起きることがあります．『英語モデルも取得』を試してください．",

            // Language settings
            recognitionLanguage: "音声認識言語　：",
            font: "フォント　：",
            pcFont: "PC内フォント：",
            fontPlaceholder: "フォント名を入力",
            translationLang1: "翻訳言語（１）：",
            translationLang2: "翻訳言語（２）：",
            translationLang3: "翻訳言語（３）：",

            // Language options
            langNone: "なし",
            langJapanese: "日本語",
            langEnglish: "英語",
            langKorean: "韓国語",
            langChinese: "中国語",
            langTaiwanese: "台湾語",
            langHongKong: "香港語",
            langFrench: "フランス語",
            langItalian: "イタリア語",
            langGerman: "ドイツ語",
            langTurkish: "トルコ語",
            langSwedish: "スウェーデン語",
            langPolish: "ポーランド語",
            langUkrainian: "ウクライナ語",
            langRussian: "ロシア語",
            langSpanish: "スペイン語",
            langPortuguese: "ポルトガル語",
            langDutch: "オランダ語",
            langIndonesian: "インドネシア語",
            langVietnamese: "ベトナム語",
            langThai: "タイ語",
            langArabic: "アラビア語",
            langSomali: "ソマリ語",
            langGreek: "ギリシャ語",

            // Interim text markers
            interimTextMarker: "認識途中文字：",
            interimTextLeft: "左側",
            interimTextRight: "右側",

            // Word boosting
            wordBoostTitle: "優先音声認識：",
            wordBoostDesc: "1行に1つ、優先認識したい語句を入力",
            wordBoostHint: "読みが難しい語句は、ひらがなで入力し、「語句置換」にて「ひらがな→対象語句」しましょう。",
            wordBoostPlaceholder: "例：字幕ちゃん\nリアルタイム音声認識\nとよはしぎじゅつかがくだいがく\nにしむら",
            wordBoostStrength: "優先度：",
            wordBoostChecking: "（対応状況を確認中...）",

            // Word replacement
            wordReplaceTitle: "語句置換：",
            wordReplaceDesc: "1行に1つ「置換前→置換後」の形式で入力",
            wordReplacePlaceholder: "例：にしむら→西村\nじまく→字幕",

            // Line spacing
            lineSpacing: "行間：",
            lineSpacingRecogToTrans1: "認識→翻訳１",
            lineSpacingTrans1To2: "翻訳１→２",
            lineSpacingTrans2To3: "翻訳２→３",

            // Text position
            textPosition: "テキストの位置：　",
            horizontal: "左右：",
            vertical: "上下：",
            alignLeft: "左寄せ",
            alignCenter: "中央寄せ",
            alignRight: "右寄せ",
            alignTop: "上",
            alignBottom: "下",

            // Text wrapping
            textWrapping: "テキストの改行：",
            noWrap: "改行しない",
            wrapAtEdge: "画面端で改行",

            // Timer settings
            timerClearText: "何ミリ秒後に文を消す？　　　：　",
            timerUnit: "ミリ秒　",
            timerSpeechWaiting: "🎤待機",
            timerTransWaiting: "🌐待機",

            // Short pause settings
            shortPauseLabel: "何ミリ秒黙ったら文を区切る？：　",
            shortPauseNote: "ミリ秒（半角数字で入れてね．1000ミリ秒 = 1秒）",
            shortPauseHint: "（500：すぐ切る｜750：普通｜1000：つなぐ　調整して．何も入れないと，これまでと同じ動作になる．）",

            // Bouyomi-chan
            bouyomiLabel: "- 棒読みちゃん連携を使う：",
            bouyomiNote: " ← 使う場合チェック入れる．詳細 → ",

            // Sensitive word filter
            sensitiveWordLabel: "- センシティブワード対応（***に置き換え）を",
            sensitiveWordDisable: "やめる",
            sensitiveWordNote: "：",

            // Save/Load buttons
            saveSettings: "設定ファイルをPCに保存",
            loadSettings: "設定ファイルをブラウザに読込",
            saveLoadNote: "：設定が完成したら，設定ファイルを保存しておきましょう　",

            // BAT file section
            batFileTitle: ".bat ファイル生成：",
            batFileDesc: "これ使ったら，",
            batFileHighlight: "全画面ゲームしてても止まらない！",
            batFileDescEnd: "詳しくはこちら→（",
            batFileVideo: "解説動画",
            batFileInstruction: ".batファイルと，設定ファイルをダウンロードしてください．",
            forWindows: "Windowsの人：",
            forMac: "Macの人：",
            generateWinBat: "Windows用 起動 .batファイル生成",
            generateMacCommand: "Mac用 起動 .commandファイル生成",

            // Secret feature
            secretFeatureLabel: "秘密機能開放：",

            // Font selector option
            pcFontOption: "[PC内フォント]",

            // Alerts and messages
            alertNoUrl: "URLがありません．エラーです．",
            alertNoPresets: "保存するプリセットが見つかりません！",
            alertPresetSaved: "プリセットをファイルに保存しました",
            alertPresetLoaded: "プリセットを読み込みました",
            alertInvalidFile: "不正なファイル形式です",
            alertFileError: "ファイル読み込みエラー: ",
            alertPresetSaveError: "プリセット保存エラー: ",
            alertLegacyConverted: "旧形式の設定ファイルをプリセットに変換して読み込みました"
        },

        en: {
            // Page title
            pageTitle: "jimakuChan: Speech Recognition Subtitles [CONFIG]",

            // Iframe instruction
            iframeInstruction: "Click the screen above to hide settings, click again to show.",

            // Preset section
            presetLabel: "Settings Preset:",
            presetDefault: "📋 Select a preset",
            presetGaming: "🎮 Gaming Stream",
            presetMeeting: "💼 Meeting / Conference",
            presetLanguageLearning: "📚 Language Learning",
            presetAccessibility: "♿ Accessibility Focus",
            presetCuteStreaming: "🌸 Cute Streaming",
            presetDarkTheme: "🌙 Dark Theme",
            presetRainbow: "🌈 Rainbow",
            presetCustom1: "🔧 Custom 1",
            presetCustom2: "🔧 Custom 2",
            presetCustom3: "🔧 Custom 3",
            presetNote: "※ Settings auto-save when selected ✨",

            // API Key section
            apiKeyLabel: "Google API-KEY for Translation:",
            apiKeyHowTo: "[How to create]",
            transCount: "Translation count:",
            transFreeLimit: "(Free limit: 5,000)",
            transLabel: "Translation:",
            transWaiting: "Waiting",

            // Chrome Translation
            chromeTranslationDetected: "🚀 Fast translation Chrome is running",
            translationMethod: "Translation method:",
            chromeBuiltIn: "Chrome Built-in (Fast)",
            gasApi: "GAS API",
            downloadModel: "📥 Download Model",
            modelRemaining: "📦 0 remaining",

            // Text settings table
            textColor: "Text Color",
            borderColor: "Border Color",
            size: "Size",
            weight: "Weight",
            border: "Border",
            recognition: "Recognition:",
            translation1: "Translation 1:",
            translation2: "Translation 2:",
            translation3: "Translation 3:",

            // Background color
            backgroundColor: "Background Color:",

            // Recognition model
            recognitionModel: "Recognition Model:",
            recogModelCloud: "Cloud (Google)",
            recogModelLocal: "Local (On your PC)",
            recogModelStatusAvailable: "✅ Available",
            recogModelStatusDownloadable: "📥 Download required",
            recogModelStatusDownloading: "📥 Downloading...",
            recogModelStatusUnavailable: "⚠ Unavailable",
            recogModelStatusChecking: "🔍 Checking...",
            recogModelStatusUnsupported: "⚠ Unsupported (requires Chrome 138+)",
            recogModelDownloadBtn: "Download Model",
            recogModelCloudWarn: "⚠ A local model for this language is installed on this PC. Due to Chrome's behavior, recognition may run locally even if Cloud is selected.",
            recogModelGuideBtn: "For advanced users: removing local models",
            recogModelCopyBtn: "Copy",
            recogModelCopied: "Copied. Paste it into Chrome's address bar to open.",
            recogModelCopyFailed: "Copy failed. Please copy the text above manually.",
            recogModelGuideStep1: "1) Paste the copied address into Chrome's address bar and open it",
            recogModelGuideStep2: "2) Turn on \"Live Caption\" (a list of installed languages will appear)",
            recogModelGuideStep3: "3) Delete all languages in the list",
            recogModelGuideStep4: "4) Turn \"Live Caption\" back off and restart Chrome",
            recogModelGuideWarn: "Note: Selecting Local again will require re-downloading the model.",
            recogModelEnMissing: "⚠ Without the English model, recognition results may not be returned.",
            recogModelEnInstallBtn: "Also get English model",
            recogNoResultWarn: "Audio is being received, but no recognition results are returned. This can happen when the English model is not installed. Try \"Also get English model\".",

            // Language settings
            recognitionLanguage: "Recognition Language:",
            font: "Font:",
            pcFont: "System Font:",
            fontPlaceholder: "Enter font name",
            translationLang1: "Translation Language (1):",
            translationLang2: "Translation Language (2):",
            translationLang3: "Translation Language (3):",

            // Language options
            langNone: "None",
            langJapanese: "Japanese",
            langEnglish: "English",
            langKorean: "Korean",
            langChinese: "Chinese",
            langTaiwanese: "Taiwanese",
            langHongKong: "Hong Kong",
            langFrench: "French",
            langItalian: "Italian",
            langGerman: "German",
            langTurkish: "Turkish",
            langSwedish: "Swedish",
            langPolish: "Polish",
            langUkrainian: "Ukrainian",
            langRussian: "Russian",
            langSpanish: "Spanish",
            langPortuguese: "Portuguese",
            langDutch: "Dutch",
            langIndonesian: "Indonesian",
            langVietnamese: "Vietnamese",
            langThai: "Thai",
            langArabic: "Arabic",
            langSomali: "Somali",
            langGreek: "Greek",

            // Interim text markers
            interimTextMarker: "Interim Text:",
            interimTextLeft: "Left",
            interimTextRight: "Right",

            // Word boosting
            wordBoostTitle: "Priority Recognition:",
            wordBoostDesc: "One phrase per line to prioritize recognition",
            wordBoostHint: "For hard-to-read phrases, enter in hiragana and use \"Word Replace\" to convert.",
            wordBoostPlaceholder: "e.g.: Subtitle Chan\nreal-time speech recognition\ntoyohashi\nnishimura",
            wordBoostStrength: "Priority:",
            wordBoostChecking: "(Checking compatibility...)",

            // Word replacement
            wordReplaceTitle: "Word Replace:",
            wordReplaceDesc: "One rule per line: \"before→after\"",
            wordReplacePlaceholder: "e.g.: nishimura→Nishimura\njimaku→Subtitle",

            // Line spacing
            lineSpacing: "Line Spacing:",
            lineSpacingRecogToTrans1: "Recognition→Trans1",
            lineSpacingTrans1To2: "Trans1→2",
            lineSpacingTrans2To3: "Trans2→3",

            // Text position
            textPosition: "Text Position: ",
            horizontal: "Horizontal:",
            vertical: "Vertical:",
            alignLeft: "Left",
            alignCenter: "Center",
            alignRight: "Right",
            alignTop: "Top",
            alignBottom: "Bottom",

            // Text wrapping
            textWrapping: "Text Wrapping:",
            noWrap: "No wrap",
            wrapAtEdge: "Wrap at edge",

            // Timer settings
            timerClearText: "Clear text after (ms): ",
            timerUnit: "ms ",
            timerSpeechWaiting: "🎤Wait",
            timerTransWaiting: "🌐Wait",

            // Short pause settings
            shortPauseLabel: "Sentence break after silence (ms): ",
            shortPauseNote: "ms (Enter numbers. 1000ms = 1 second)",
            shortPauseHint: "(500: Quick | 750: Normal | 1000: Connected. Leave empty for default.)",

            // Bouyomi-chan
            bouyomiLabel: "- Use Bouyomi-chan TTS:",
            bouyomiNote: " ← Check to enable. Details → ",

            // Sensitive word filter
            sensitiveWordLabel: "- Sensitive word filter (replace with ***)",
            sensitiveWordDisable: "Disable",
            sensitiveWordNote: ":",

            // Save/Load buttons
            saveSettings: "Save Settings to PC",
            loadSettings: "Load Settings from File",
            saveLoadNote: ": Save your settings after configuration ",

            // BAT file section
            batFileTitle: ".bat File Generator:",
            batFileDesc: "Use this to ",
            batFileHighlight: "keep running during fullscreen games!",
            batFileDescEnd: " Details → (",
            batFileVideo: "Tutorial Video",
            batFileInstruction: "Download the .bat file and settings file.",
            forWindows: "For Windows:",
            forMac: "For Mac:",
            generateWinBat: "Generate Windows .bat file",
            generateMacCommand: "Generate Mac .command file",

            // Secret feature
            secretFeatureLabel: "Secret Features:",

            // Font selector option
            pcFontOption: "[System Font]",

            // Alerts and messages
            alertNoUrl: "URL not found. Error.",
            alertNoPresets: "No presets found to save!",
            alertPresetSaved: "Presets saved to file",
            alertPresetLoaded: "Presets loaded",
            alertInvalidFile: "Invalid file format",
            alertFileError: "File loading error: ",
            alertPresetSaveError: "Preset save error: ",
            alertLegacyConverted: "Legacy settings file converted and loaded as preset"
        }
    },

    /**
     * Get translation for a key
     * @param {string} key - Translation key
     * @param {string} lang - Language code (optional, uses currentLang if not specified)
     * @returns {string} Translated text
     */
    t: function(key, lang) {
        const language = lang || this.currentLang;
        const translation = this.translations[language];
        if (translation && translation[key]) {
            return translation[key];
        }
        // Fallback to Japanese
        if (this.translations.ja && this.translations.ja[key]) {
            return this.translations.ja[key];
        }
        console.warn(`Translation not found for key: ${key}`);
        return key;
    },

    /**
     * Set current language
     * @param {string} lang - Language code ('ja' or 'en')
     */
    setLanguage: function(lang) {
        if (this.translations[lang]) {
            this.currentLang = lang;
            localStorage.setItem('jimakuChan_language', lang);
            this.applyTranslations();
            this.updateLanguageButtons();
        }
    },

    /**
     * Apply translations to all elements with data-i18n attribute
     */
    applyTranslations: function() {
        // Update page title
        document.title = this.t('pageTitle');

        // Update all elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            el.textContent = this.t(key);
        });

        // Update all elements with data-i18n-placeholder attribute
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            el.placeholder = this.t(key);
        });

        // Update all elements with data-i18n-title attribute
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            el.title = this.t(key);
        });

        // Update select options with data-i18n-options
        document.querySelectorAll('select[data-i18n-options]').forEach(select => {
            const optionsMap = select.getAttribute('data-i18n-options');
            if (optionsMap) {
                try {
                    const mapping = JSON.parse(optionsMap);
                    select.querySelectorAll('option').forEach(option => {
                        const key = mapping[option.value];
                        if (key) {
                            option.textContent = this.t(key);
                        }
                    });
                } catch (e) {
                    console.error('Error parsing i18n-options:', e);
                }
            }
        });
    },

    /**
     * Update language button states
     */
    updateLanguageButtons: function() {
        const jaBtn = document.getElementById('langBtnJa');
        const enBtn = document.getElementById('langBtnEn');

        if (jaBtn && enBtn) {
            if (this.currentLang === 'ja') {
                jaBtn.style.background = '#4CAF50';
                jaBtn.style.color = 'white';
                enBtn.style.background = '#e0e0e0';
                enBtn.style.color = '#333';
            } else {
                enBtn.style.background = '#4CAF50';
                enBtn.style.color = 'white';
                jaBtn.style.background = '#e0e0e0';
                jaBtn.style.color = '#333';
            }
        }
    },

    /**
     * Initialize i18n system
     */
    init: function() {
        // Load saved language preference
        const savedLang = localStorage.getItem('jimakuChan_language');
        if (savedLang && this.translations[savedLang]) {
            this.currentLang = savedLang;
        }

        // Apply translations after DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.applyTranslations();
                this.updateLanguageButtons();
            });
        } else {
            this.applyTranslations();
            this.updateLanguageButtons();
        }
    }
};

// Initialize i18n when script loads
i18n.init();
