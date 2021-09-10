const urls = ["./shader/light.vert", "./shader/light.frag"];
Promise.all(urls.map(url =>
    fetch(url).then(resp => resp.text())
)).then(shader => {
    const canvas = document.getElementById("canvas");
    const gl = getWebGLContext(canvas);

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.enable(gl.DEPTH_TEST);

    const model_matrix = new Matrix4();
    const perspective_matrix = new Matrix4();
    const normal_matrix = new Matrix4();

    const WIDTH = 6;
    const OUTLINE_COLOR = [.6, .1, .5, 1];
    const MODEL_COLOR = [.9, .65, .4, 1];

    let moveX = 0, moveY = 0;

    document.addEventListener("keydown", function (e) {
        switch (e.key) {
        case "ArrowLeft":
            moveX -= 1;
            break;
        case "ArrowRight":
            moveX += 1;
            break;
        case "ArrowUp":
            moveY += 1;
            break;
        case "ArrowDown":
            moveY -= 1;
            break;
        }
    })

    perspective_matrix.setPerspective(30, canvas.clientWidth / canvas.clientHeight, 1, 100);

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



    gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
	gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ZERO);

	// Create the texture for the selection mask.  For best (and easiest) results
	// this should be the same size as the frame buffer.
	const level = 0;
	const border = 0;
	const selectionMask = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, selectionMask);
	gl.texImage2D(gl.TEXTURE_2D, level, gl.RGBA,
				  gl.drawingBufferWidth, gl.drawingBufferHeight, border,
				  gl.RGBA, gl.UNSIGNED_BYTE, null);
	// Set filtering to NEAREST;  we will be doing a lot of texture lookups
	// in the fragment shader, but since we will always be looking up the
	// center of a pixel, we can make the fragment shader faster by not
	// interpolating.
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	const maskFB = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, maskFB);  // bind so we can set params
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D,
							selectionMask, level);
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);  // bind the canvas
	gl.bindTexture(gl.TEXTURE_2D, null); // unbind the texture

	// Create the quad for the overlay.  Opengl's native coordinate system
	// ranges from (-1, -1) [lower left] to (1, 1) [upper right].  For simplicity
	// use (0, 0) as lower left and (1, 1) as upper right and do the mapping
	// in the shader.  This allows us to not bother with an additional texture
	// coordinate array.
	let quadVerts = [ 0, 0,   1, 0,   1, 1,
					  1, 1,   0, 1,   0, 0 ];
	const quad = { vertices: createGLBuffer(gl, quadVerts),
				   count: quadVerts.length / 2 }
	const pixelSize = [ 1.0 / gl.canvas.clientWidth,
						1.0 / gl.canvas.clientHeight ];

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

// const BLUR_FRAGMENT = `
//     precision highp float;
//     uniform sampler2D texture;
//     uniform vec2 pixelSize;
//     uniform vec4 color;
//     varying vec2 texCoord;
//     uniform float u_size;
//     void main()
//     {
//         vec2 p = gl_FragCoord.xy;
//         vec4 p0 = texture2D(texture, (p + vec2(-1.0, -1.0)) / u_size);
//         vec4 p1 = texture2D(texture, (p + vec2(0.0, -1.0)) / u_size);
//         vec4 p2 = texture2D(texture, (p + vec2(1.0, -1.0)) / u_size);
//         vec4 p3 = texture2D(texture, (p + vec2(-1.0, 0.0)) / u_size);
//         vec4 p5 = texture2D(texture, (p + vec2(1.0, 0.0)) / u_size);
//         vec4 p6 = texture2D(texture, (p + vec2(-1.0, 1.0)) / u_size);
//         vec4 p7 = texture2D(texture, (p + vec2(0.0, 1.0)) / u_size);
//         vec4 p8 = texture2D(texture, (p + vec2(1.0, 1.0)) / u_size);
//         vec4 gx = -p0 + p2 - 2.0 * p3 + 2.0 * p5 - p6 + p8;
//         vec4 gy = -p0 - 2.0 * p1 - p2 + p6 + 2.0 * p7 + p8;
//         gl_FragColor = vec4(
//             length(vec2(gx.x, gy.x))*color.r,
//             length(vec2(gx.y, gy.y))*color.g,
//             length(vec2(gx.z, gy.z))*color.b,
//             1.0
//         );
//     }
// `;
    function createBlurShader(GL)
    {
        const program = createProgram(GL, BLUR_VERTEX, BLUR_FRAGMENT);
        return { program: program,
                textureLoc: GL.getUniformLocation(program, 'texture'),
                pixelSizeLoc: GL.getUniformLocation(program, 'pixelSize'),
                kernelLoc: GL.getUniformLocation(program, 'kernel'),
                colorLoc: GL.getUniformLocation(program, 'color'),
                verticesLoc: GL.getAttribLocation(program, 'pos'),
                sizeLoc: GL.getUniformLocation(program, 'u_size'),
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
`;
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

	const selectionShader = createUnlitShader(gl);
    const blurShader = createBlurShader(gl);
    const tableShader = createLightingShader(gl);

    const LIGHTS = { ambient: [ 0.4, 0.4, 0.4 ],
				 directional: {
					 color: [ 1, 1, 1 ],
					 direction: [ -1, -1, -1 ]
				 },
			   };
    
    function createLighting(lights)
    {
        let makeNormalized = function(v) {
            const invLen = 1.0 / Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
            return [ invLen * v[0], invLen * v[1], invLen * v[2] ];
        };

        return { ambient: lights.ambient,
                            lightDir: makeNormalized(lights.directional.direction),
                            lightColor: lights.directional.color
                        };
    }
	const lights = createLighting(LIGHTS);
	const model = createTable(gl);
    const WHITE = [1, 1, 1, 1];




    render();

    function render() {
        model_matrix.setTranslate(0, 0, 0);
        model_matrix.rotate(moveX, 0.0, 1.0, 0.0);
        model_matrix.rotate(moveY, 1.0, 0.0, 0.0,);
        normal_matrix.setInverseOf(model_matrix);
        normal_matrix.transpose();

        model_matrix.lookAt(3, 3, 7, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0);

        // Draw the rest of the scene first
		// gl.clearColor(1, 1, 1, 1);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);


		gl.bindFramebuffer(gl.FRAMEBUFFER, maskFB);
		gl.clearColor(0, 0, 0, 1);
		gl.clear(gl.COLOR_BUFFER_BIT);
		drawModel(gl, selectionShader, perspective_matrix.elements, model_matrix.elements, lights, WHITE, model);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);




		gl.bindTexture(gl.TEXTURE_2D, selectionMask);
		gl.useProgram(blurShader.program);
		gl.bindBuffer(gl.ARRAY_BUFFER, quad.vertices);
		gl.vertexAttribPointer(blurShader.verticesLoc, 2, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(blurShader.verticesLoc);
		gl.uniform1i(blurShader.textureLoc, 0);  // first texture
		gl.uniform2fv(blurShader.pixelSizeLoc, pixelSize);
		gl.uniform4fv(blurShader.colorLoc, OUTLINE_COLOR);
        gl.uniform1f(blurShader.sizeLoc, Math.max(gl.drawingBufferWidth,gl.drawingBufferHeight));   

		gl.disable(gl.DEPTH_TEST);
		gl.enable(gl.BLEND);
		gl.drawArrays(gl.TRIANGLES, 0, quad.count);
		gl.disable(gl.BLEND);
		gl.enable(gl.DEPTH_TEST);
		gl.disableVertexAttribArray(blurShader.verticesLoc);
		gl.bindTexture(gl.TEXTURE_2D, null);



		// drawModel(gl, tableShader, perspective_matrix.elements, model_matrix.elements, lights, MODEL_COLOR, model);

        // requestAnimationFrame(render);
    }
})

