const FIELD_OF_VIEW_DEG = 60;
const DIST = 1.707;
const ROTATION_TIME = 10.0;  // time for the model to rotate 360 deg

const WHITE = [1, 1, 1, 1];
const BG_COLOR = WHITE;
const MODEL_COLOR = [.9, .65, .4, 1];
const OUTLINE_COLOR = [.6, .1, .5, 1];
const LIGHTS = { ambient: [ 0.4, 0.4, 0.4 ],
				 directional: {
					 color: [ 1, 1, 1 ],
					 direction: [ -1, -1, -1 ]
				 },
			   };
const WIDTH = 6;

const UNLIT_VERTEX = `
    attribute vec4 pos;
    uniform mat4 modelView;
    uniform mat4 projection;
    void main()
    {
        gl_Position = projection * modelView * pos;
    }
`;
const UNLIT_FRAGMENT = `
    precision highp float;
    uniform vec4 color;
    void main()
    {
        gl_FragColor = color;
    }
`;

function createUnlitShader(GL)
{
	const program = createProgram(GL, UNLIT_VERTEX, UNLIT_FRAGMENT);
	return { program: program,
			 modelViewLoc: GL.getUniformLocation(program, 'modelView'),
			 projectionLoc: GL.getUniformLocation(program, 'projection'),
			 colorLoc: GL.getUniformLocation(program, 'color'),
			 verticesLoc: GL.getAttribLocation(program, 'pos'),
		   };
}

const SIMPLE_VERTEX = `
    attribute vec4 pos;
    attribute vec3 normal;
    uniform mat4 modelView;
    uniform mat4 projection;
    uniform vec3 lightDir;
    varying vec3 vToLight;
    varying vec3 vVertex;
    varying vec3 vNormal;

    void main()
    {
        gl_Position = projection * modelView * pos;

        // This will work as long as modelView has uniform scaling
        vToLight = (modelView * vec4(-lightDir, 0.0)).xyz;
        vNormal = (modelView * vec4(normal, 0.0)).xyz;
    }
`;

const SIMPLE_FRAGMENT = `
    precision highp float;
    uniform vec3 ambientLight;
    uniform vec3 lightColor;
    uniform vec4 color;
    varying vec3 vToLight;
    varying vec3 vNormal;
    void main()
    {
        float NdotL = max(0.0, dot(vToLight, vNormal));
        vec4 ambient = vec4(ambientLight, 1.0) * color;
        vec4 diffuse = NdotL * vec4(lightColor, 1.0) * color;
        gl_FragColor = ambient + diffuse;
    }
`

function createLightingShader(GL)
{
	const program = createProgram(GL, SIMPLE_VERTEX, SIMPLE_FRAGMENT);
	return { program: program,
			 modelViewLoc: GL.getUniformLocation(program, 'modelView'),
			 projectionLoc: GL.getUniformLocation(program, 'projection'),
			 ambientLightLoc: GL.getUniformLocation(program, 'ambientLight'),
			 lightDirLoc: GL.getUniformLocation(program, 'lightDir'),
			 lightColorLoc: GL.getUniformLocation(program, 'lightColor'),
			 colorLoc: GL.getUniformLocation(program, 'color'),
			 verticesLoc: GL.getAttribLocation(program, 'pos'),
			 normalsLoc: GL.getAttribLocation(program, 'normal'),
		   };
}

const BLUR_VERTEX = `
    uniform vec2 pixelSize;
    attribute vec2 pos;
    varying vec2 texCoord;
    void main()
    {
        texCoord = pos;
        // pos ranges from [(0, 0), (1, 1)], so we need to convert to OpenGL's
        // native coordinates of [(-1, -1], (1, 1)].
        gl_Position = vec4(2.0 * pos.x - 1.0, 2.0 * pos.y - 1.0, 0.0, 1.0);
    }
`;

const BLUR_FRAGMENT = `
    precision highp float;
    uniform sampler2D texture;
    uniform vec2 pixelSize;
    uniform vec4 color;
    varying vec2 texCoord;
    void main()
    {
        const int w = ` + WIDTH + `;
        bool isInside = false;
        int count = 0;
        float coverage = 0.0;
        float dist = 1e6;
        for (int y = -w;  y <= w;  ++y) {
            for (int x = -w;  x <= w;  ++x) {
                vec2 dUV = vec2(float(x) * pixelSize.x, float(y) * pixelSize.y);
                float mask = texture2D(texture, texCoord + dUV).r;
                coverage += mask;
                if (mask >= 0.5) {
                    dist = min(dist, sqrt(float(x * x + y * y)));
                }
                if (x == 0 && y == 0) {
                    isInside = (mask > 0.5);
                }
                count += 1;
            }
        }
        coverage /= float(count);
        float a;
        if (isInside) {
            a = min(1.0, (1.0 - coverage) / 0.75);
        } else {
            const float solid = 0.3 * float(w);
            const float fuzzy = float(w) - solid;
            a = 1.0 - min(1.0, max(0.0, dist - solid) / fuzzy);
        }
        gl_FragColor = color;
        gl_FragColor.a = a;
    }
`;

function createBlurShader(GL)
{
	const program = createProgram(GL, BLUR_VERTEX, BLUR_FRAGMENT);
	return { program: program,
			 textureLoc: GL.getUniformLocation(program, 'texture'),
			 pixelSizeLoc: GL.getUniformLocation(program, 'pixelSize'),
			 kernelLoc: GL.getUniformLocation(program, 'kernel'),
			 colorLoc: GL.getUniformLocation(program, 'color'),
			 verticesLoc: GL.getAttribLocation(program, 'pos'),
		   };
}

function run_offsetOutline(canvas)
{
	// const GL = canvas.getContext('webgl');
    // let canvas = document.getElementById("canvas");
    const GL = getWebGLContext(canvas);
	initGL(GL);

	const outlineShader = createUnlitShader(GL);
	const shader = createLightingShader(GL);

	const lights = createLighting(LIGHTS);
	const model = createTable(GL);
	const projection = calcProjectionMatrix(GL);

	function draw(nowMSec) {
		const now = 0.001 * nowMSec
		const modelView = calcCameraMatrix(now);

		// Draw the rest of the scene first
		GL.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);
        // <draw scene>

		// Scale the modelview matrix.  We also want to offset the model back
		// from the camera, but since our camera is always pointing at (0, 0, 0),
		// the matrix is offset and the scaling will increase the offset for us.
		let outlineMV = glMatrix.mat4.create();
		glMatrix.mat4.scale(outlineMV, modelView, [1.06, 1.06, 1.06]);
	
		// Draw the outline of the selected object. Don't write to the depth
		// buffer so that we ensure that the outline is always behind the object.
		GL.disable(GL.DEPTH_TEST);
		drawModel(GL, outlineShader, projection, outlineMV, lights, OUTLINE_COLOR, model);
		GL.enable(GL.DEPTH_TEST);

		// Draw the selected object.  If it was already drawn in the scene you
		// will need to enable polygon offset.
		drawModel(GL, shader, projection, modelView, lights, MODEL_COLOR, model);

		requestAnimationFrame(draw);
	};
	requestAnimationFrame(draw);
}

function run_blurOutline(canvas)
{
	// const GL = canvas.getContext('webgl');
    // let canvas = document.getElementById("canvas");
    const GL = getWebGLContext(canvas);
	initGL(GL);
	GL.blendEquationSeparate(GL.FUNC_ADD, GL.FUNC_ADD);
	GL.blendFuncSeparate(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA, GL.ONE, GL.ZERO);

	// Create the texture for the selection mask.  For best (and easiest) results
	// this should be the same size as the frame buffer.
	const level = 0;
	const border = 0;
	const selectionMask = GL.createTexture();
	GL.bindTexture(GL.TEXTURE_2D, selectionMask);
	GL.texImage2D(GL.TEXTURE_2D, level, GL.RGBA,
				  GL.drawingBufferWidth, GL.drawingBufferHeight, border,
				  GL.RGBA, GL.UNSIGNED_BYTE, null);
	// Set filtering to NEAREST;  we will be doing a lot of texture lookups
	// in the fragment shader, but since we will always be looking up the
	// center of a pixel, we can make the fragment shader faster by not
	// interpolating.
	GL.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.NEAREST);
	GL.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.CLAMP_TO_EDGE);
	GL.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.CLAMP_TO_EDGE);
	const maskFB = GL.createFramebuffer();
	GL.bindFramebuffer(GL.FRAMEBUFFER, maskFB);  // bind so we can set params
	GL.framebufferTexture2D(GL.FRAMEBUFFER, GL.COLOR_ATTACHMENT0, GL.TEXTURE_2D,
							selectionMask, level);
	GL.bindFramebuffer(GL.FRAMEBUFFER, null);  // bind the canvas
	GL.bindTexture(GL.TEXTURE_2D, null); // unbind the texture

	// Create the quad for the overlay.  OpenGL's native coordinate system
	// ranges from (-1, -1) [lower left] to (1, 1) [upper right].  For simplicity
	// use (0, 0) as lower left and (1, 1) as upper right and do the mapping
	// in the shader.  This allows us to not bother with an additional texture
	// coordinate array.
	let quadVerts = [ 0, 0,   1, 0,   1, 1,
					  1, 1,   0, 1,   0, 0 ];
	const quad = { vertices: createGLBuffer(GL, quadVerts),
				   count: quadVerts.length / 2 }
	const pixelSize = [ 1.0 / GL.canvas.clientWidth,
						1.0 / GL.canvas.clientHeight ];

	const shader = createLightingShader(GL);
	const selectionShader = createUnlitShader(GL);
	const blurShader = createBlurShader(GL);

	const lights = createLighting(LIGHTS);
	const model = createTable(GL);
	const projection = calcProjectionMatrix(GL);

	function draw(nowMSec) {
		const now = 0.001 * nowMSec
		const modelView = calcCameraMatrix(now);

		// Draw the rest of the scene first
		GL.clearColor(BG_COLOR[0], BG_COLOR[1], BG_COLOR[2], BG_COLOR[3]);
		GL.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);
		// <draw scene>
	
		// Draw the selected object into the texture.
		// We don't need to call GL.viewport() since everything is identical
		// to the canvas' framebuffer.
		GL.bindFramebuffer(GL.FRAMEBUFFER, maskFB);
		GL.clearColor(0, 0, 0, 1);
		GL.clear(GL.COLOR_BUFFER_BIT);
		drawModel(GL, selectionShader, projection, modelView, lights, WHITE, model);
		GL.bindFramebuffer(GL.FRAMEBUFFER, null);

		// Overlay the texture on top of the scene.  Disable depth writes,
		// as we will need to draw the model on top.
		GL.bindTexture(GL.TEXTURE_2D, selectionMask);
		GL.useProgram(blurShader.program);
		GL.bindBuffer(GL.ARRAY_BUFFER, quad.vertices);
		GL.vertexAttribPointer(blurShader.verticesLoc, 2, GL.FLOAT, false, 0, 0);
		GL.enableVertexAttribArray(blurShader.verticesLoc);
		GL.uniform1i(blurShader.textureLoc, 0);  // first texture
		GL.uniform2fv(blurShader.pixelSizeLoc, pixelSize);
		GL.uniform4fv(blurShader.colorLoc, OUTLINE_COLOR);

		GL.disable(GL.DEPTH_TEST);
		GL.enable(GL.BLEND);
		GL.drawArrays(GL.TRIANGLES, 0, quad.count);
		GL.disable(GL.BLEND);
		GL.enable(GL.DEPTH_TEST);
		GL.disableVertexAttribArray(blurShader.verticesLoc);
		GL.bindTexture(GL.TEXTURE_2D, null);

		// Draw the selected object.  If it was already drawn in the scene you
		// will need to enable polygon offset.
		drawModel(GL, shader, projection, modelView, lights, MODEL_COLOR, model);

		requestAnimationFrame(draw);
	};
	requestAnimationFrame(draw);
}

function calcCameraMatrix(nowSec)
{
	const longPerSec = 2.0 * Math.PI / ROTATION_TIME;
	const latPerSec = 0.5 * Math.PI / ROTATION_TIME;
	const longitudeRad = (longPerSec * nowSec) % 360.0;
	const latitudeRad = (latPerSec * nowSec) % 180.0;
	let modelView = glMatrix.mat4.create();
	glMatrix.mat4.translate(modelView, modelView, [0.0, 0.0, -DIST]);
	glMatrix.mat4.rotateY(modelView, modelView, longitudeRad);
	glMatrix.mat4.rotateZ(modelView, modelView, latitudeRad);
	return modelView;
}

function calcProjectionMatrix(GL)
{
	const fov = glMatrix.glMatrix.toRadian(FIELD_OF_VIEW_DEG);
	const aspect = GL.canvas.clientWidth / GL.canvas.clientHeight;
	const zNear = 0.1;
	const zFar = 100.0;
	let projection = glMatrix.mat4.create();
	glMatrix.mat4.perspective(projection, fov, aspect, zNear, zFar); 
	return projection;
}

function createLighting(lights)
{
	let makeNormalized = function(v) {
		const invLen = 1.0 / Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
		return [ invLen * v[0], invLen * v[1], invLen * v[2] ];
	};

	return glLights = { ambient: lights.ambient,
						lightDir: makeNormalized(lights.directional.direction),
						lightColor: lights.directional.color
					  };
}

function drawModel(GL, shader, projection, modelView, lights, color, model)
{
	GL.useProgram(shader.program);

	GL.bindBuffer(GL.ARRAY_BUFFER, model.vertices);
	GL.vertexAttribPointer(shader.verticesLoc, 3, GL.FLOAT, false, 0, 0);
	GL.enableVertexAttribArray(shader.verticesLoc);

	if ('normalsLoc' in shader) {
		GL.bindBuffer(GL.ARRAY_BUFFER, model.normals);
		GL.vertexAttribPointer(shader.normalsLoc, 3, GL.FLOAT, false, 0, 0);
		GL.enableVertexAttribArray(shader.normalsLoc);
	}
	
	GL.uniformMatrix4fv(shader.projectionLoc, false, projection);
	GL.uniformMatrix4fv(shader.modelViewLoc, false, modelView);
	GL.uniform3fv(shader.ambientLightLoc, lights.ambient);
	GL.uniform3fv(shader.lightDirLoc, lights.lightDir);
	GL.uniform3fv(shader.lightColorLoc, lights.lightColor);
	GL.uniform4fv(shader.colorLoc, color);

	GL.drawArrays(GL.TRIANGLES, 0, model.count);

	GL.disableVertexAttribArray(shader.verticesLoc);
	GL.disableVertexAttribArray(shader.normalsLoc);
}

//-------------------------- WebGL boilerplate ----------------------------------
function initGL(GL)
{
	GL.clearColor(BG_COLOR[0], BG_COLOR[1], BG_COLOR[2], BG_COLOR[3]);
	GL.clearDepth(1.0);
	GL.enable(GL.DEPTH_TEST);
	GL.depthFunc(GL.LEQUAL);
}

function createProgram(GL, vertexSource, fragmentSource)
{
	const vertexProgram = compileProgram(GL, GL.VERTEX_SHADER, vertexSource);
	const fragmentProgram = compileProgram(GL, GL.FRAGMENT_SHADER, fragmentSource);
	if (vertexProgram == null || fragmentProgram == null) {
		return null;  // already handled the error in compileShader()
	}

	const program = GL.createProgram();
	GL.attachShader(program, vertexProgram);
	GL.attachShader(program, fragmentProgram);
	GL.linkProgram(program);
	if (!GL.getProgramParameter(program, GL.LINK_STATUS)) {
		console.error('Could not link shader program: ' + GL.getProgramInfoLog(program));
		GL.deleteProgram(program);
		return null;
	}
	return program;
}

function compileProgram(GL, type, source)
{
	const program = GL.createShader(type);
	GL.shaderSource(program, source);
	GL.compileShader(program);
	if (!GL.getShaderParameter(program, GL.COMPILE_STATUS)) {
		console.error('Error compiling the shaders: ' + GL.getShaderInfoLog(program));
		console.warn(source);
		GL.deleteShader(program);
		return null;
	}

	return program;
}

function createGLBuffer(GL, data)
{
	const buffer = GL.createBuffer();
	GL.bindBuffer(GL.ARRAY_BUFFER, buffer);
	GL.bufferData(GL.ARRAY_BUFFER, new Float32Array(data), GL.STATIC_DRAW)
	return buffer;
}

//------------------------- Model creation --------------------------------------
function createTable(GL)
{
	// Create everything using JS arrays, since they are expandable
	let verts = [];
	let normals = [];
	const height = 0.5;
	const bottomY = -height / 2;
	const radius = 0.5;
	const legSize = 0.075
	const legY = bottomY + height / 2.0;
	const legPos = 0.7 * radius;
	const crossY = bottomY + 0.333 * height;
	const crossLen = 2.0 * legPos;
	const crossSize = 0.6 * legSize;
	
	// legs
	addCube(verts, normals, -legPos, legY, -legPos, legSize, height, legSize);
	addCube(verts, normals, -legPos, legY,  legPos, legSize, height, legSize);
	addCube(verts, normals,  legPos, legY, -legPos, legSize, height, legSize);
	addCube(verts, normals,  legPos, legY,  legPos, legSize, height, legSize);
	// cross-bars
	addCube(verts, normals, -legPos, crossY, 0, crossSize, crossSize, crossLen);
	addCube(verts, normals,  legPos, crossY, 0, crossSize, crossSize, crossLen);
	addCube(verts, normals, 0, crossY, -legPos, crossLen, crossSize, crossSize);
	addCube(verts, normals, 0, crossY,  legPos, crossLen, crossSize, crossSize);
	// table top
	addCube(verts, normals, 0, bottomY + height, 0, 2 * radius, legSize, 2 * radius);

	// Now that we know how big everything is, copy to typed arrays for OpenGL
	let table = { vertices: createGLBuffer(GL, verts),
				  normals: createGLBuffer(GL, normals),
				  count: verts.length / 3 };
	return table;
}

function addCube(verts, normals, x, y, z, xSize, ySize, zSize)
{
	const halfX = xSize / 2.0;
	const halfY = ySize / 2.0;
	const halfZ = zSize / 2.0;

	const A = [x - halfX, y - halfY, z - halfZ];
	const B = [x - halfX, y - halfY, z + halfZ];
	const C = [x - halfX, y + halfY, z - halfZ];
	const D = [x - halfX, y + halfY, z + halfZ];
	const E = [x + halfX, y - halfY, z - halfZ];
	const F = [x + halfX, y - halfY, z + halfZ];
	const G = [x + halfX, y + halfY, z - halfZ];
	const H = [x + halfX, y + halfY, z + halfZ];

	// -x
	let n = [-1, 0, 0];
	addTri(verts, normals, A, n, B, n, D, n);
	addTri(verts, normals, D, n, C, n, A, n);

	// +x
	n = [1, 0, 0];
	addTri(verts, normals, F, n, E, n, G, n);
	addTri(verts, normals, G, n, H, n, F, n);

	// -y
	n = [0, -1, 0];
	addTri(verts, normals, A, n, E, n, F, n);
	addTri(verts, normals, F, n, B, n, A, n);

	// +y
	n = [0, 1, 0];
	addTri(verts, normals, C, n, D, n, H, n);
	addTri(verts, normals, H, n, G, n, C, n);

	// -y
	n = [0, 0, -1];
	addTri(verts, normals, A, n, C, n, G, n);
	addTri(verts, normals, G, n, E, n, A, n);

	// +y
	n = [0, 0, 1];
	addTri(verts, normals, B, n, F, n, H, n);
	addTri(verts, normals, H, n, D, n, B, n);
}

function addTri(vertices, normals, v1, n1, v2, n2, v3, n3)
{
	addVertex(vertices, normals, v1, n1);
	addVertex(vertices, normals, v2, n2);
	addVertex(vertices, normals, v3, n3);
}

function addVertex(vertices, normals, v, n)
{
	vertices.push(v[0]);
	vertices.push(v[1]);
	vertices.push(v[2]);
	normals.push(n[0]);
	normals.push(n[1]);
	normals.push(n[2]);
}

let canvas = document.getElementById("canvas");
run_offsetOutline(canvas);