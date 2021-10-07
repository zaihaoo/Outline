const urls = ["./shader/outline.vs", "./shader/outline.fs"];
Promise.all(urls.map(url =>
    fetch(url).then(resp => resp.text())
)).then(shader => {
    const canvas = document.getElementById("canvas");
    const gl = getWebGLContext(canvas);
    let ext = gl.getExtension("OES_standard_derivatives"); 
    if (!ext) { 
        alert("this machine or browser does not support OES_standard_derivatives"); 
    } 

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.enable(gl.DEPTH_TEST);

    const model_matrix = new Matrix4();
    const perspective_matrix = new Matrix4();
    const normal_matrix = new Matrix4();

    const WIDTH = 6;
    const OUTLINE_COLOR = [.6, .1, .5, 1];
    const MODEL_COLOR = [.9, .65, .4, 1];
    const WHITE = [1, 1, 1, 1];

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



    // gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
	// gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ZERO);

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

    function createBlurShader(GL)
    {
        const program = createProgram(GL, shader[0], shader[1]);
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





    requestAnimationFrame(render);

    function render(nowMSec) {
		const now = 0.1 * nowMSec
        const ROTATION_TIME = 15.0;  // 模型旋转360度所需要的时间
        const longPerSec = 2.0 * Math.PI / ROTATION_TIME;
        const latPerSec = 0.5 * Math.PI / ROTATION_TIME;
        const longitudeRad = (longPerSec * now) % 360.0;
        const latitudeRad = (latPerSec * now) % 180.0;

        model_matrix.setTranslate(0, 0, -8);
        model_matrix.rotate(longitudeRad, 0.0, 1.0, 0.0);
        model_matrix.rotate(latitudeRad, 0.0, 0.0, 1.0,);

        normal_matrix.setInverseOf(model_matrix);
        normal_matrix.transpose();

        // model_matrix.lookAt(3, 3, 7, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0);

        // Draw the rest of the scene first
		// gl.clearColor(1, 1, 1, 1);

        // gl.clearColor(1.0, 0.0, 0.0, 1.0);





		gl.bindFramebuffer(gl.FRAMEBUFFER, maskFB);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		drawModel(gl, selectionShader, perspective_matrix.elements, model_matrix.elements, lights, OUTLINE_COLOR, model);
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
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		gl.drawArrays(gl.TRIANGLES, 0, quad.count);
		gl.disable(gl.BLEND);
		gl.enable(gl.DEPTH_TEST);
		gl.disableVertexAttribArray(blurShader.verticesLoc);
		gl.bindTexture(gl.TEXTURE_2D, null);




		drawModel(gl, tableShader, perspective_matrix.elements, model_matrix.elements, lights, MODEL_COLOR, model);

        requestAnimationFrame(render);
    }
})

