// WebGL Flower Generator
console.log('WebGL Script loading...');

class WebGLFlowerGenerator {
    constructor() {
        console.log('PureWebGLFlowerGenerator constructor called');
        
        this.canvas = document.getElementById('flowerCanvas');
        if (!this.canvas) {
            console.error('Canvas element not found!');
            return;
        }
        
        // Initialize seed system
        this.currentSeed = this.generateRandomSeed();
        this.seedRandom = this.createSeededRandom(this.currentSeed);
        
        // Track previous flower type to ensure variety
        this.previousFlowerType = -1; // -1 means no previous flower
        
        // Set canvas to fullscreen dimensions
        this.resizeCanvas();
        
        // Get WebGL context with alpha enabled and preserveDrawingBuffer for downloads
        this.gl = this.canvas.getContext('webgl', { 
            alpha: true, 
            premultipliedAlpha: false,
            preserveDrawingBuffer: true 
        }) || this.canvas.getContext('experimental-webgl', { 
            alpha: true, 
            premultipliedAlpha: false,
            preserveDrawingBuffer: true 
        });
        if (!this.gl) {
            console.error('WebGL not supported!');
            alert('WebGL is required for this application. Please use a modern browser that supports WebGL.');
            return;
        }
        
        console.log('WebGL context obtained successfully');
        
        try {
            this.initWebGL();
            this.initControls();
            this.setupResizeHandler();
            this.generateFlower();
            console.log('WebGL initialization successful');
        } catch (error) {
            console.error('WebGL initialization failed:', error);
            alert('WebGL initialization failed: ' + error.message);
        }
    }
    
    // Seed management functions
    generateRandomSeed() {
        return Math.floor(Math.random() * 999999);
    }
    
    createSeededRandom(seed) {
        // Simple seeded random number generator (LCG)
        let current = seed;
        return function() {
            current = (current * 1664525 + 1013904223) % Math.pow(2, 32);
            return current / Math.pow(2, 32);
        };
    }
    
    setSeed(seed) {
        this.currentSeed = seed;
        this.seedRandom = this.createSeededRandom(seed);
        this.updateSeedDisplay();
    }
    
    updateSeedDisplay() {
        if (this.seedControl) {
            this.seedControl.value = this.currentSeed.toString();
        }
    }
    
    resizeCanvas() {
        const viewport = window.visualViewport;
        const cssWidth = viewport ? viewport.width : window.innerWidth;
        const cssHeight = viewport ? viewport.height : window.innerHeight;
        const dpr = window.devicePixelRatio || 1;

        // Align canvas CSS size with the visual viewport
        this.canvas.style.width = `${cssWidth}px`;
        this.canvas.style.height = `${cssHeight}px`;

        // Set canvas internal resolution to match viewport * device pixel ratio for sharpness
        this.canvas.width = Math.max(1, Math.round(cssWidth * dpr));
        this.canvas.height = Math.max(1, Math.round(cssHeight * dpr));

        if (this.gl) {
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        }
        
        console.log(`Canvas resized to: ${this.canvas.width}x${this.canvas.height} (CSS: ${cssWidth}x${cssHeight}, DPR: ${dpr})`);
    }
    
    setupResizeHandler() {
        const handleResize = () => {
            this.resizeCanvas();
            if (this.gl && this.currentFlowerData) {
                this.updateColors();
            }
        };

        window.addEventListener('resize', handleResize);

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', handleResize);
            window.visualViewport.addEventListener('scroll', handleResize);
        }
    }
    
    initWebGL() {
        const gl = this.gl;
        
        // Vertex shader - simple fullscreen quad
        this.vertexShaderSource = `
            attribute vec2 a_position;
            void main() {
                gl_Position = vec4(a_position, 0.0, 1.0);
            }
        `;

        // Advanced fragment shader for flower generation
        this.fragmentShaderSource = `
            precision mediump float;
            
            uniform vec2 u_resolution;
            uniform float u_time;
            uniform float u_petalCount;
            uniform float u_flowerSize;
            uniform vec3 u_petalColor;
            uniform vec3 u_centerColor;
            uniform vec3 u_stemColor;
            uniform float u_stemThickness;
            uniform int u_flowerType;
            uniform int u_stemType;
            uniform int u_leafType;
            uniform int u_leafCount;
            uniform float u_randomSeed;
            uniform float u_hueShift;
            
            // Improved random function
            float random(vec2 st) {
                return fract(sin(dot(st.xy + u_randomSeed, vec2(12.9898, 78.233))) * 43758.5453123);
            }
            
            // HSV to RGB conversion
            vec3 hsv2rgb(vec3 c) {
                vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
                vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
                return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
            }
            
            // RGB to HSV conversion
            vec3 rgb2hsv(vec3 c) {
                vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
                vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
                vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
                
                float d = q.x - min(q.w, q.y);
                float e = 1.0e-10;
                return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
            }
            
            // Apply hue shift to a color
            vec3 shiftHue(vec3 color, float hueShift) {
                vec3 hsv = rgb2hsv(color);
                hsv.x = mod(hsv.x + hueShift / 360.0, 1.0);
                return hsv2rgb(hsv);
            }
            
            // 2D Noise function
            float noise(vec2 st) {
                vec2 i = floor(st);
                vec2 f = fract(st);
                
                vec2 u = f * f * (3.0 - 2.0 * f);
                
                return mix(mix(random(i + vec2(0.0,0.0)), 
                              random(i + vec2(1.0,0.0)), u.x),
                          mix(random(i + vec2(0.0,1.0)), 
                              random(i + vec2(1.0,1.0)), u.x), u.y);
            }
            
            // Distance to circle
            float sdCircle(vec2 p, float r) {
                return length(p) - r;
            }
            
            // Rotate point
            vec2 rotate(vec2 p, float angle) {
                float c = cos(angle);
                float s = sin(angle);
                return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
            }
            
            // 0 - Classic flower
            float classicFlower(vec2 p, float petals, float size) {
                float angle = atan(p.y, p.x);
                float radius = length(p);
                
                // Offset petals so none align with stem (pointing down)
                float petalOffset = 3.14159 / petals * 0.75; // 3/4 petal spacing for better avoidance
                
                // Smooth petal pattern with hand-drawn variation
                float petalPattern = sin((angle + petalOffset) * petals) * 0.4 + 0.6;
                petalPattern += noise(vec2(angle * 2.0, u_time * 0.1)) * 0.1;
                
                return radius - size * petalPattern;
            }
            
            // 1 - Star flower
            float starFlower(vec2 p, float petals, float size) {
                float angle = atan(p.y, p.x);
                float radius = length(p);
                
                // Offset petals so none align with stem
                float petalOffset = 3.14159 / petals * 0.75;
                
                // Sharp star pattern with shorter petals
                float petalAngle = mod(angle + petalOffset + 3.14159, 6.28318 / petals) * petals;
                float starPattern = cos(petalAngle - 3.14159 * 0.5) * 0.5 + 0.5;
                starPattern = pow(starPattern, 2.0);
                
                // Shorter petals: increased base size, reduced petal extension
                return radius - size * (0.4 + starPattern * 0.25);
            }
            
            // 2 - Round flower
            float roundFlower(vec2 p, float petals, float size) {
                float angle = atan(p.y, p.x);
                float radius = length(p);
                
                // Offset petals so none align with stem
                float petalOffset = 3.14159 / petals * 0.75;
                
                // Soft, rounded petals
                float petalPattern = sin((angle + petalOffset) * petals);
                petalPattern = smoothstep(-0.5, 0.5, petalPattern) * 0.4 + 0.6;
                petalPattern += noise(p * 3.0) * 0.1;
                
                return radius - size * petalPattern;
            }
            
            // 3 - Geometric flower
            float geometricFlower(vec2 p, float petals, float size) {
                float angle = atan(p.y, p.x);
                float radius = length(p);
                
                // Offset petals so none align with stem
                float petalOffset = 3.14159 / petals * 0.75;
                
                // Geometric pattern
                float petalAngle = mod(angle + petalOffset + 3.14159, 6.28318 / petals) * petals;
                float geoPattern = abs(sin(petalAngle)) * 0.5 + 0.5;
                
                return radius - size * geoPattern;
            }
            
            // 4 - Simple round flower (circle, no petals)
            float simpleRoundFlower(vec2 p, float petals, float size) {
                float radius = length(p);
                
                // Circle - made smaller
                return radius - size * 0.6;
            }
            
            // 5 - Tulip bud flower (teardrop with sharp top)
            float tulipBudFlower(vec2 p, float petals, float size) {
                
                vec2 tulipP = p;
                
                // Stretch vertically to make it taller like a tulip
                tulipP.y *= 1.4;
                
                // Create an ellipse that's wider at bottom, narrower at top (triangular taper)
                float ellipseRadius = 0.35 - tulipP.y * 0.5;
                ellipseRadius = max(ellipseRadius, 0.005);
                
                // Calculate distance but use correct scaling pattern like other flowers
                float dist = length(tulipP / vec2(ellipseRadius, 0.6));
                
                // Use same pattern as other flowers: return distance to edge
                return dist - size * 0.85; // Make it a bit bigger
            }
            
            
            // Get flower distance based on type with optional angle variation
            float getFlowerDistance(vec2 p, int flowerType, float petals, float size, float stemAngle) {
                // Apply stem angle rotation for curved stems
                vec2 flowerP = p;
                if (stemAngle != 0.0) {
                    float c = cos(stemAngle);
                    float s = sin(stemAngle);
                    flowerP = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
                }
                
                if (flowerType == 1) return starFlower(flowerP, petals, size);
                else if (flowerType == 2) return roundFlower(flowerP, petals, size);
                else if (flowerType == 3) return geometricFlower(flowerP, petals, size);
                else if (flowerType == 4) return simpleRoundFlower(flowerP, petals, size);
                else if (flowerType == 5) return tulipBudFlower(flowerP, petals, size);
                else return classicFlower(flowerP, petals, size);
            }
            
            // Draw flower center with variations
            float getFlowerCenter(vec2 p, float size) {
                // Add random variation to center size (0.05 to 0.30 of flower size, average ~0.175)
                float centerSizeVariation = 0.05 + random(vec2(u_randomSeed, u_randomSeed * 1.5)) * 0.25;
                float centerDist = sdCircle(p, size * centerSizeVariation);
                
                // Add texture to center
                float centerNoise = noise(p * 20.0 + u_time) * 0.02;
                centerDist += centerNoise;
                
                return centerDist;
            }
            
            // Curved stem (simple sine wave)
            float curvedStem(vec2 p) {
                // Stem Y range - extend to flower center
                float stemTop = 0.0;
                float stemBottom = -1.0;
                
                // Only process points within stem Y range
                if (p.y > stemTop || p.y < stemBottom) {
                    return 1.0;
                }
                
                // Calculate where the sine curve should be at this Y position
                float curveX = sin(p.y * 3.0) * 0.1;
                
                // Simple horizontal distance to the curve
                return abs(p.x - curveX) - u_stemThickness;
            }
            
            // Straight stem (simple vertical line)
            float straightStem(vec2 p) {
                vec2 stemStart = vec2(0.0, 0.0);
                vec2 stemEnd = vec2(0.0, -1.0);
                
                // Simple straight line distance
                vec2 pa = p - stemStart;
                vec2 ba = stemEnd - stemStart;
                float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
                return length(pa - ba * h) - u_stemThickness;
            }
            
            // Mirrored curved stem (curves in opposite direction)
            float mirroredCurvedStem(vec2 p) {
                // Stem Y range - extend to flower center
                float stemTop = 0.0;
                float stemBottom = -1.0;
                
                // Only process points within stem Y range
                if (p.y > stemTop || p.y < stemBottom) {
                    return 1.0;
                }
                
                // Calculate where the mirrored sine curve should be (negative of original)
                float curveX = -sin(p.y * 3.0) * 0.1;
                
                // Simple horizontal distance to the curve
                return abs(p.x - curveX) - u_stemThickness;
            }
            
            // Get stem based on type
            float getStem(vec2 p, int stemType) {
                if (stemType == 1) return straightStem(p);
                else if (stemType == 2) return mirroredCurvedStem(p);
                else return curvedStem(p);
            }
            
            // Circular leaf shape
            float circularLeaf(vec2 leafP) {
                // Make it longer by scaling differently - clean ellipse
                return length(leafP / vec2(0.035, 0.07)) - 1.0;
            }
            
            // Get leaf shape based on type (only circular leaves now)
            float getLeafShape(vec2 leafP, int leafType) {
                return circularLeaf(leafP);
            }
            
            // Draw leaves that stick to the stem
            float getLeaves(vec2 p, int stemType, int leafType, int leafCount) {
                float leafDist = 1.0;
                
                // Conditionally render leaves based on count
                if (leafCount >= 1) {
                    // First leaf (adjust position for mirrored curved stem)
                    float leafY = (stemType == 2) ? -0.32 : -0.38; // Higher for mirrored curved stem
                    float leafSide = 1.0;
                    
                    // Calculate leaf position based on stem type
                    float stemX = 0.0;
                    if (stemType == 0) {
                        // Curved stem - follow the curve
                        stemX = sin(leafY * 3.0) * 0.1;
                    } else if (stemType == 2) {
                        // Mirrored curved stem - follow the mirrored curve
                        stemX = -sin(leafY * 3.0) * 0.1;
                    }
                    
                    // Position leaf offset from the stem curve
                    vec2 leafPos = vec2(stemX + leafSide * 0.05, leafY);
                    
                    vec2 leafP = p - leafPos;
                    // Adjust angle for mirrored curved stem (closer to stem)
                    float leafAngle = (stemType == 2) ? leafSide * 0.6 : leafSide * 0.8;
                    leafP = rotate(leafP, leafAngle);
                    
                    // Get leaf shape
                    float leafShape = getLeafShape(leafP, leafType);
                    leafDist = min(leafDist, leafShape);
                }
                
                if (leafCount >= 2) {
                    // Second leaf
                    float leafY = -0.45;
                    float leafSide = -1.0;
                    
                    // Calculate leaf position based on stem type
                    float stemX = 0.0;
                    if (stemType == 0) {
                        // Curved stem - follow the curve
                        stemX = sin(leafY * 3.0) * 0.1;
                    } else if (stemType == 2) {
                        // Mirrored curved stem - follow the mirrored curve
                        stemX = -sin(leafY * 3.0) * 0.1;
                    }
                    
                    // Position leaf offset from the stem curve
                    vec2 leafPos = vec2(stemX + leafSide * 0.05, leafY);
                    
                    vec2 leafP = p - leafPos;
                    leafP = rotate(leafP, leafSide * 0.5);
                    
                    // Get leaf shape
                    float leafShape = getLeafShape(leafP, leafType);
                    leafDist = min(leafDist, leafShape);
                }
                
                return leafDist;
            }
            
            void main() {
                // Normalize coordinates
                vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
                
                // Background color (transparent)
                vec3 color = vec3(0.0, 0.0, 0.0);
                
                // Flower parameters (overall size)
                float flowerRadius = u_flowerSize * 0.25; // Last time reduced from 0.35 to 0.25
                
                // Calculate stem angle for curved stems
                float stemAngle = 0.0;
                if (u_stemType == 0) {
                    // For curved stems, calculate the slope at flower attachment point
                    float attachmentY = 0.0;
                    float stemSlope = cos(attachmentY * 3.0) * 3.0 * 0.1; // Derivative of curve
                    stemAngle = atan(stemSlope) * 0.5; // Moderate angle following stem direction
                } else if (u_stemType == 2) {
                    // For mirrored curved stems, calculate the mirrored slope
                    float attachmentY = 0.0;
                    float stemSlope = -cos(attachmentY * 3.0) * 3.0 * 0.1; // Negative derivative for mirror
                    stemAngle = atan(stemSlope) * 0.5; // Moderate angle following mirrored stem direction
                }
                
                // Get distances
                float flowerDist = getFlowerDistance(uv, u_flowerType, u_petalCount, flowerRadius, stemAngle);
                float centerDist = getFlowerCenter(uv, flowerRadius);
                float stemDist = getStem(uv, u_stemType);
                float leafDist = getLeaves(uv, u_stemType, u_leafType, u_leafCount);
                
                // Create masks with smooth anti-aliasing
                float flowerMask = 1.0 - smoothstep(-0.01, 0.01, flowerDist);
                
                // Tulip buds (type 5) don't have a central circle, and randomly remove centers
                float centerMask = 0.0;
                if (u_flowerType != 5) {
                    // Random chance to have no center circle (10% chance of no center)
                    float showCenter = random(vec2(u_randomSeed * 2.0, u_randomSeed * 3.0));
                    if (showCenter > 0.1) {
                        centerMask = 1.0 - smoothstep(-0.01, 0.01, centerDist);
                    }
                }
                
                float stemMask = 1.0 - smoothstep(-0.005, 0.005, stemDist);
                float leafMask = 1.0 - smoothstep(-0.08, 0.08, leafDist); // Blurry leaves
                
                // Apply hue shift to colors
                vec3 shiftedStemColor = shiftHue(u_stemColor, u_hueShift);
                vec3 shiftedPetalColor = shiftHue(u_petalColor, u_hueShift);
                vec3 shiftedCenterColor = shiftHue(u_centerColor, u_hueShift);
                
                // Calculate overall alpha (visible parts of the flower)
                float alpha = max(max(max(flowerMask, centerMask), stemMask), leafMask);
                
                // Apply colors with proper layering
                color = mix(color, shiftedStemColor, stemMask);
                color = mix(color, shiftedStemColor * 0.8, leafMask);
                color = mix(color, shiftedPetalColor, flowerMask);
                color = mix(color, shiftedCenterColor, centerMask);
                
                // Add subtle glow effect only where there's a flower
                float glow = exp(-length(uv) * 2.0) * 0.05 * alpha;
                color += vec3(glow);
                
                gl_FragColor = vec4(color, alpha);
            }
        `;

        console.log('Compiling shaders...');
        
        // Create and compile shaders
        const vertexShader = this.createShader(gl.VERTEX_SHADER, this.vertexShaderSource);
        const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, this.fragmentShaderSource);
        
        // Create program
        this.program = gl.createProgram();
        gl.attachShader(this.program, vertexShader);
        gl.attachShader(this.program, fragmentShader);
        gl.linkProgram(this.program);
        
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            const error = gl.getProgramInfoLog(this.program);
            console.error('Program linking failed:', error);
            throw new Error('Program linking failed: ' + error);
        }
        
        console.log('Shaders compiled and linked successfully');
        
        // Get attribute and uniform locations
        this.positionLocation = gl.getAttribLocation(this.program, 'a_position');
        this.uniformLocations = {
            resolution: gl.getUniformLocation(this.program, 'u_resolution'),
            time: gl.getUniformLocation(this.program, 'u_time'),
            petalCount: gl.getUniformLocation(this.program, 'u_petalCount'),
            flowerSize: gl.getUniformLocation(this.program, 'u_flowerSize'),
            petalColor: gl.getUniformLocation(this.program, 'u_petalColor'),
            centerColor: gl.getUniformLocation(this.program, 'u_centerColor'),
            stemColor: gl.getUniformLocation(this.program, 'u_stemColor'),
            stemThickness: gl.getUniformLocation(this.program, 'u_stemThickness'),
            flowerType: gl.getUniformLocation(this.program, 'u_flowerType'),
            stemType: gl.getUniformLocation(this.program, 'u_stemType'),
            leafType: gl.getUniformLocation(this.program, 'u_leafType'),
            leafCount: gl.getUniformLocation(this.program, 'u_leafCount'),
            randomSeed: gl.getUniformLocation(this.program, 'u_randomSeed'),
            hueShift: gl.getUniformLocation(this.program, 'u_hueShift')
        };
        
        // Create buffer for fullscreen quad
        this.positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        
        // Fullscreen quad vertices
        const positions = [
            -1, -1,
             1, -1,
            -1,  1,
             1,  1,
        ];
        
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
        
        // Enable alpha blending for transparency
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        
        console.log('WebGL setup complete');
    }
    
    createShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const error = gl.getShaderInfoLog(shader);
            console.error('Shader compilation failed:', error);
            gl.deleteShader(shader);
            throw new Error('Shader compilation failed: ' + error);
        }
        
        return shader;
    }

    createShaderProgram(gl, vertexShaderSource, fragmentShaderSource) {
        // Create and compile shaders
        const vertexShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertexShader, vertexShaderSource);
        gl.compileShader(vertexShader);
        
        if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
            const error = gl.getShaderInfoLog(vertexShader);
            console.error('Vertex shader compilation failed:', error);
            gl.deleteShader(vertexShader);
            throw new Error('Vertex shader compilation failed: ' + error);
        }
        
        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragmentShader, fragmentShaderSource);
        gl.compileShader(fragmentShader);
        
        if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
            const error = gl.getShaderInfoLog(fragmentShader);
            console.error('Fragment shader compilation failed:', error);
            gl.deleteShader(vertexShader);
            gl.deleteShader(fragmentShader);
            throw new Error('Fragment shader compilation failed: ' + error);
        }
        
        // Create and link program
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const error = gl.getProgramInfoLog(program);
            console.error('Program linking failed:', error);
            gl.deleteShader(vertexShader);
            gl.deleteShader(fragmentShader);
            gl.deleteProgram(program);
            throw new Error('Program linking failed: ' + error);
        }
        
        // Clean up shaders (they're now part of the program)
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        
        return program;
    }
    
    initControls() {
        console.log('Initializing controls...');
        
        this.generateBtn = document.getElementById('generateBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.colorHueSlider = document.getElementById('colorHue');
        this.seedControl = document.getElementById('seedControl');
        
        if (this.generateBtn) {
            this.generateBtn.addEventListener('click', () => {
                console.log('Generate button clicked');
                this.generateFlower();
            });
        }
        
        if (this.downloadBtn) {
            this.downloadBtn.addEventListener('click', () => {
                console.log('Download button clicked');
                this.downloadFlower();
            });
        }
        
        if (this.colorHueSlider) {
            this.colorHueSlider.addEventListener('input', (e) => {
                const valueElement = document.getElementById('colorHueValue');
                if (valueElement) valueElement.textContent = e.target.value + '°';
                this.updateColors();
            });
        }
        
        // Wire up seed control
        if (this.seedControl) {
            const applySeed = () => {
                const seedValue = parseInt(this.seedControl.value);
                if (!isNaN(seedValue) && seedValue >= 0 && seedValue <= 999999) {
                    console.log('Applying seed:', seedValue);
                    this.setSeed(seedValue);
                    this.generateFlower(true); // Use current seed, don't generate new one
                } else {
                    alert('Please enter a valid seed number (0-999999)');
                    this.updateSeedDisplay(); // Reset to current valid seed
                }
            };
            
            // Apply seed on Enter key
            this.seedControl.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.seedControl.blur(); // Remove focus to trigger blur event
                }
            });
            
            // Apply seed when user finishes editing (clicks away)
            this.seedControl.addEventListener('blur', applySeed);
        }
        
        // Initialize seed display
        this.updateSeedDisplay();
        
        console.log('Controls initialized');
    }
    
    // Update colors only (without generating new flower shape)
    updateColors() {
        if (!this.currentFlowerData) return;
        
        const gl = this.gl;
        if (!gl || !this.program) return;
        
        try {
            // Set viewport
            gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            
            // Use shader program
            gl.useProgram(this.program);
            
            // Bind position buffer
            gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
            gl.enableVertexAttribArray(this.positionLocation);
            gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);
            
            // Get current hue shift
            const hueShift = this.colorHueSlider ? parseFloat(this.colorHueSlider.value) : 0;
            
            // Use existing flower data but with new hue
            const data = this.currentFlowerData;
            
            // Set uniforms
            gl.uniform2f(this.uniformLocations.resolution, this.canvas.width, this.canvas.height);
            gl.uniform1f(this.uniformLocations.time, data.time);
            gl.uniform1f(this.uniformLocations.petalCount, data.petalCount);
            gl.uniform1f(this.uniformLocations.flowerSize, data.flowerSize);
            gl.uniform3fv(this.uniformLocations.petalColor, data.colorPalette.petal);
            gl.uniform3fv(this.uniformLocations.centerColor, data.colorPalette.center);
            gl.uniform3fv(this.uniformLocations.stemColor, data.colorPalette.stem);
            gl.uniform1f(this.uniformLocations.stemThickness, data.stemThickness);
            gl.uniform1i(this.uniformLocations.flowerType, data.flowerType);
            gl.uniform1i(this.uniformLocations.stemType, data.stemType);
            gl.uniform1f(this.uniformLocations.randomSeed, data.randomSeed);
            gl.uniform1f(this.uniformLocations.hueShift, hueShift);
            
            // Clear and draw with transparent background
            gl.clearColor(0.0, 0.0, 0.0, 0.0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            
        } catch (error) {
            console.error('Error updating colors:', error);
        }
    }
    
    getRandomColorPalette() {
        const palettes = [
            {
                petal: [1.0, 0.4, 0.4],    // Red
                center: [1.0, 0.8, 0.3],   // Yellow
                stem: [0.3, 0.6, 0.2]      // Green
            },
            {
                petal: [0.3, 0.7, 1.0],    // Blue
                center: [1.0, 0.3, 0.6],   // Pink
                stem: [0.2, 0.5, 0.3]      // Dark green
            },
            {
                petal: [0.8, 0.3, 1.0],    // Purple
                center: [1.0, 1.0, 0.3],   // Bright yellow
                stem: [0.4, 0.6, 0.2]      // Light green
            },
            {
                petal: [1.0, 0.6, 0.8],    // Pink
                center: [0.3, 1.0, 0.8],   // Cyan
                stem: [0.3, 0.7, 0.3]      // Medium green
            },
            {
                petal: [1.0, 0.5, 0.0],    // Orange
                center: [0.9, 0.9, 0.1],   // Yellow
                stem: [0.2, 0.6, 0.2]      // Forest green
            },
            {
                petal: [0.9, 0.9, 0.9],    // White
                center: [1.0, 0.8, 0.0],   // Gold
                stem: [0.3, 0.5, 0.2]      // Olive green
            }
        ];
        
        return palettes[Math.floor(this.seedRandom() * palettes.length)];
    }
    
    generateFlower(useCurrentSeed = false) {
        console.log('Generating WebGL flower...');
        
        // Generate new seed unless we're using a specific seed
        if (!useCurrentSeed) {
            this.currentSeed = this.generateRandomSeed();
            this.seedRandom = this.createSeededRandom(this.currentSeed);
        }
        
        const gl = this.gl;
        if (!gl || !this.program) {
            console.error('WebGL not properly initialized');
            return;
        }
        
        try {
            // Set viewport
            gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            
            // Use shader program
            gl.useProgram(this.program);
            
            // Bind position buffer
            gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
            gl.enableVertexAttribArray(this.positionLocation);
            gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);
            
            // Generate properties using seed
            const petalCount = 5 + Math.floor(this.seedRandom() * 8); // 5-12 petals
            let flowerSize = 0.8 + this.seedRandom() * 0.4; // 0.8-1.2 size (limited range)
            const colorPalette = this.getRandomColorPalette();
            const stemType = Math.floor(this.seedRandom() * 3); // 0-2 for different stem types
            
            // Don't show tulip flowers (type 5) on curved stems (types 0 and 2)
            // Also ensure flower type changes on every generation
            let flowerType;
            let availableTypes;
            
            if (stemType === 0 || stemType === 2) {
                // Curved stems: exclude tulips, use types 0-4
                availableTypes = [0, 1, 2, 3, 4];
            } else {
                // Straight stems: allow all flower types including tulips
                availableTypes = [0, 1, 2, 3, 4, 5];
            }
            
            // Remove previous flower type to ensure variety
            if (this.previousFlowerType !== -1) {
                availableTypes = availableTypes.filter(type => type !== this.previousFlowerType);
            }
            
            // If we somehow have no available types (shouldn't happen), use all types for this stem
            if (availableTypes.length === 0) {
                availableTypes = stemType === 0 || stemType === 2 ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5];
            }
            
            // Select random type from available types
            flowerType = availableTypes[Math.floor(this.seedRandom() * availableTypes.length)];
            
            // Store the previous type before updating (for logging)
            const previousTypeForLogging = this.previousFlowerType;
            
            // Update previous flower type for next generation
            this.previousFlowerType = flowerType;
            
            const leafType = 1; // Always use circular leaves (type 1)
            const leafCount = Math.floor(this.seedRandom() * 3); // 0-2 leaves
            
            // Fixed stem thickness for all flowers
            const stemThickness = 0.013;
            const randomSeed = this.seedRandom() * 1000;
            const time = Date.now() / 1000;
            
                    // Store current flower data for color updates
            this.currentFlowerData = {
            petalCount,
            flowerSize,
            colorPalette,
            flowerType,
            stemType,
            leafType,
            leafCount,
            stemThickness,
            randomSeed,
            time
        };
            
                    console.log('Flower properties:', { 
            petalCount, 
            flowerSize: flowerSize.toFixed(3), 
            flowerType,
            previousFlowerType: previousTypeForLogging === -1 ? 'NONE (first flower)' : ['Classic', 'Star', 'Round', 'Geometric', 'Simple Round', 'Tulip Bud'][previousTypeForLogging],
            stemType: stemType === 0 ? 'CURVED (static)' : stemType === 1 ? 'STRAIGHT' : 'MIRRORED_CURVED (static)',
            stemThickness: stemThickness.toFixed(4),
            stemToFlowerRatio: (stemThickness / flowerSize).toFixed(4),
            leafType: 'CIRCULAR',
            leafCount,
            flowerTypeName: ['Classic', 'Star', 'Round', 'Geometric', 'Simple Round', 'Tulip Bud'][flowerType],
            colorPalette 
        });
            
            // Get current hue shift
            const hueShift = this.colorHueSlider ? parseFloat(this.colorHueSlider.value) : 0;
            
            // Set uniforms
            gl.uniform2f(this.uniformLocations.resolution, this.canvas.width, this.canvas.height);
            gl.uniform1f(this.uniformLocations.time, time);
            gl.uniform1f(this.uniformLocations.petalCount, petalCount);
            gl.uniform1f(this.uniformLocations.flowerSize, flowerSize);
            gl.uniform3fv(this.uniformLocations.petalColor, colorPalette.petal);
            gl.uniform3fv(this.uniformLocations.centerColor, colorPalette.center);
            gl.uniform3fv(this.uniformLocations.stemColor, colorPalette.stem);
            gl.uniform1f(this.uniformLocations.stemThickness, stemThickness);
                    gl.uniform1i(this.uniformLocations.flowerType, flowerType);
            gl.uniform1i(this.uniformLocations.stemType, stemType);
            gl.uniform1i(this.uniformLocations.leafType, leafType);
            gl.uniform1i(this.uniformLocations.leafCount, leafCount);
            gl.uniform1f(this.uniformLocations.randomSeed, randomSeed);
            gl.uniform1f(this.uniformLocations.hueShift, hueShift);
            
            // Clear and draw with transparent background
            gl.clearColor(0.0, 0.0, 0.0, 0.0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            
            console.log('WebGL flower rendered successfully');
            
            // Update seed display
            this.updateSeedDisplay();
            
        } catch (error) {
            console.error('Error generating flower:', error);
        }
    }
    

    
    downloadFlower() {
        try {
            console.log('Attempting to download high-resolution flower...');
            
            if (!this.currentFlowerData) {
                console.error('No flower data available');
                alert('Download failed, please save the seed and try again later');
                return;
            }
            
            // High resolution multiplier
            const resolutionMultiplier = 3;
            const highResWidth = this.canvas.width * resolutionMultiplier;
            const highResHeight = this.canvas.height * resolutionMultiplier;
            
            console.log(`Creating high-res version: ${highResWidth}x${highResHeight} (${resolutionMultiplier}x)`);
            
            // Create high-resolution WebGL canvas
            const highResCanvas = document.createElement('canvas');
            highResCanvas.width = highResWidth;
            highResCanvas.height = highResHeight;
            
            const highResGl = highResCanvas.getContext('webgl', { 
                alpha: true, 
                premultipliedAlpha: false,
                preserveDrawingBuffer: true 
            }) || highResCanvas.getContext('experimental-webgl', { 
                alpha: true, 
                premultipliedAlpha: false,
                preserveDrawingBuffer: true 
            });
            
            if (!highResGl) {
                throw new Error('Failed to create high-resolution WebGL context');
            }
            
            // Set up high-res WebGL context with existing shaders
            const highResProgram = this.createShaderProgram(highResGl, this.vertexShaderSource, this.fragmentShaderSource);
            if (!highResProgram) {
                throw new Error('Failed to create high-resolution shader program');
            }
            
            // Create position buffer for high-res canvas
            const highResPositionBuffer = highResGl.createBuffer();
            highResGl.bindBuffer(highResGl.ARRAY_BUFFER, highResPositionBuffer);
            const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
            highResGl.bufferData(highResGl.ARRAY_BUFFER, positions, highResGl.STATIC_DRAW);
            
            // Get uniform and attribute locations for high-res rendering
            const highResUniformLocations = {
                resolution: highResGl.getUniformLocation(highResProgram, 'u_resolution'),
                time: highResGl.getUniformLocation(highResProgram, 'u_time'),
                petalCount: highResGl.getUniformLocation(highResProgram, 'u_petalCount'),
                flowerSize: highResGl.getUniformLocation(highResProgram, 'u_flowerSize'),
                petalColor: highResGl.getUniformLocation(highResProgram, 'u_petalColor'),
                centerColor: highResGl.getUniformLocation(highResProgram, 'u_centerColor'),
                stemColor: highResGl.getUniformLocation(highResProgram, 'u_stemColor'),
                stemThickness: highResGl.getUniformLocation(highResProgram, 'u_stemThickness'),
                flowerType: highResGl.getUniformLocation(highResProgram, 'u_flowerType'),
                stemType: highResGl.getUniformLocation(highResProgram, 'u_stemType'),
                leafType: highResGl.getUniformLocation(highResProgram, 'u_leafType'),
                leafCount: highResGl.getUniformLocation(highResProgram, 'u_leafCount'),
                randomSeed: highResGl.getUniformLocation(highResProgram, 'u_randomSeed'),
                hueShift: highResGl.getUniformLocation(highResProgram, 'u_hueShift')
            };
            
            const highResPositionLocation = highResGl.getAttribLocation(highResProgram, 'a_position');
            
            // Render at high resolution
            highResGl.viewport(0, 0, highResWidth, highResHeight);
            highResGl.useProgram(highResProgram);
            
            // Bind position buffer
            highResGl.bindBuffer(highResGl.ARRAY_BUFFER, highResPositionBuffer);
            highResGl.enableVertexAttribArray(highResPositionLocation);
            highResGl.vertexAttribPointer(highResPositionLocation, 2, highResGl.FLOAT, false, 0, 0);
            
            // Set uniforms with current flower data
            const data = this.currentFlowerData;
            const hueShift = this.colorHueSlider ? parseFloat(this.colorHueSlider.value) : 0;
            
            highResGl.uniform2f(highResUniformLocations.resolution, highResWidth, highResHeight);
            highResGl.uniform1f(highResUniformLocations.time, data.time);
            highResGl.uniform1f(highResUniformLocations.petalCount, data.petalCount);
            highResGl.uniform1f(highResUniformLocations.flowerSize, data.flowerSize);
            highResGl.uniform3fv(highResUniformLocations.petalColor, data.colorPalette.petal);
            highResGl.uniform3fv(highResUniformLocations.centerColor, data.colorPalette.center);
            highResGl.uniform3fv(highResUniformLocations.stemColor, data.colorPalette.stem);
            highResGl.uniform1f(highResUniformLocations.stemThickness, data.stemThickness);
            highResGl.uniform1i(highResUniformLocations.flowerType, data.flowerType);
            highResGl.uniform1i(highResUniformLocations.stemType, data.stemType);
            highResGl.uniform1i(highResUniformLocations.leafType, data.leafType);
            highResGl.uniform1i(highResUniformLocations.leafCount, data.leafCount);
            highResGl.uniform1f(highResUniformLocations.randomSeed, data.randomSeed);
            highResGl.uniform1f(highResUniformLocations.hueShift, hueShift);
            
            // Clear and draw
            highResGl.clear(highResGl.COLOR_BUFFER_BIT);
            highResGl.drawArrays(highResGl.TRIANGLE_STRIP, 0, 4);
            
            // Create final composite canvas with black background
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = highResWidth;
            finalCanvas.height = highResHeight;
            const finalCtx = finalCanvas.getContext('2d');
            
            // Fill with black background
            finalCtx.fillStyle = '#000000';
            finalCtx.fillRect(0, 0, highResWidth, highResHeight);
            
            // Draw the high-res WebGL canvas on top
            finalCtx.drawImage(highResCanvas, 0, 0);
            
            // Create download link
            const link = document.createElement('a');
            link.download = `flowerseed-${this.currentSeed}.png`;
            
            // Get canvas data URL from the final composited canvas
            const dataURL = finalCanvas.toDataURL('image/png');
            
            if (dataURL === 'data:,') {
                console.error('Canvas is empty - cannot download');
                alert('Download failed, please save the seed and try again later');
                return;
            }
            
            link.href = dataURL;
            
            // Trigger download
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            console.log(`High-resolution download triggered successfully: ${highResWidth}x${highResHeight}`);
            
        } catch (error) {
            console.error('Download failed:', error);
            alert('Download failed: ' + error.message);
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing WebGL flower generator');
    new WebGLFlowerGenerator();
});

console.log('WebGL Script loaded completely');
