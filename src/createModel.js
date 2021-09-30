//------------------------- Model creation --------------------------------------
function createTable(GL,out=false)
{
	// Create everything using JS arrays, since they are expandable
	let verts = [];
	let normals = [];
	const height = 0.5;
	const bottomY = -height / 2;
	let radius = 0.5;
	let legSize = 0;
	if (out){		
		legSize = 0.13;
	}
	else{		
		legSize = 0.075;
	}

	const legY = bottomY + height / 2.0;
	const legPos = 0.7 * radius;
	const crossY = bottomY + 0.333 * height;
	const crossLen = 2.0 * legPos;
	const crossSize = 0.6 * legSize;
	const modelColor = [.9, .65, .4];
	let colors = [];
	
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
	if (out){		
		addCube(verts, normals, 0, bottomY + height, 0, 2.1 * radius, legSize, 2.1 * radius);
	}
	else{		
		addCube(verts, normals, 0, bottomY + height, 0, 2 * radius, legSize, 2 * radius);
	}

	for (let i=0;i<(verts.length/3);i++){
		colors = colors.concat(modelColor);
	}

	// Now that we know how big everything is, copy to typed arrays for OpenGL
	let table = { vertices: createGLBuffer(GL, verts),
				  colors: createGLBuffer(GL, colors),
				  normals: createGLBuffer(GL, normals),
				  count: verts.length / 3 };
	return table;
}

function createGLBuffer(GL, data)
{
	const buffer = GL.createBuffer();
	GL.bindBuffer(GL.ARRAY_BUFFER, buffer);
	GL.bufferData(GL.ARRAY_BUFFER, new Float32Array(data), GL.STATIC_DRAW)
	return buffer;
	// return new Float32Array(data);
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