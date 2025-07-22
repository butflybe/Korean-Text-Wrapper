// 컴포넌트 연결 끊어진 오브젝트 찾기 - UI 버전

console.log('컴포넌트 검사 플러그인 시작');

// UI 표시
figma.showUI(__html__, {
  width: 400,
  height: 600,
  title: "Detached Component Finder"
});

// 전역 변수
let currentProblems = [];
let searchInProgress = false;

// 초기화
function init() {
  const selection = figma.currentPage.selection;
  
  figma.ui.postMessage({
    type: 'init',
    data: {
      hasSelection: selection.length > 0,
      selectionCount: selection.length,
      currentPage: figma.currentPage.name,
      totalPages: figma.root.children.length
    }
  });
}

// UI 메시지 처리
figma.ui.onmessage = function(msg) {
  try {
    switch(msg.type) {
      case 'search-selected':
        if (!searchInProgress) searchSelectedNodes();
        break;
      case 'search-page':
        if (!searchInProgress) searchCurrentPage();
        break;
      case 'search-all':
        if (!searchInProgress) searchAllPages();
        break;
      case 'select-node':
        selectNode(msg.nodeId);
        break;
      case 'detach-instance':
        detachInstance(msg.nodeId);
        break;
      case 'delete-node':
        deleteNode(msg.nodeId);
        break;
      case 'select-all-current':
        selectAllCurrent();
        break;
      case 'fix-missing':
        fixMissingComponents();
        break;
      case 'fix-unused':
        fixUnusedComponents();
        break;
      case 'export-report':
        exportReport();
        break;
      case 'cancel':
        figma.closePlugin();
        break;
    }
  } catch (error) {
    console.error('메시지 처리 오류:', error);
    sendMessage('error', '처리 중 오류가 발생했습니다.');
  }
};

// 메시지 전송 헬퍼
function sendMessage(type, message, data) {
  figma.ui.postMessage({
    type: type,
    message: message,
    data: data
  });
}

// 선택된 노드들 검사
function searchSelectedNodes() {
  searchInProgress = true;
  sendMessage('search-start', '선택된 노드들을 검사하는 중...');
  
  try {
    const selection = figma.currentPage.selection;
    const problems = [];
    
    for (const node of selection) {
      findProblemsInNode(node, problems);
    }
    
    finishSearch(problems, '선택된 노드');
  } catch (error) {
    handleSearchError(error);
  }
}

// 현재 페이지 검사
function searchCurrentPage() {
  searchInProgress = true;
  sendMessage('search-start', '현재 페이지를 검사하는 중...');
  
  try {
    const problems = [];
    const nodes = figma.currentPage.findAll(() => true);
    
    let processed = 0;
    for (const node of nodes) {
      checkNode(node, problems, figma.currentPage.name);
      processed++;
      
      if (processed % 100 === 0) {
        sendMessage('search-progress', `검사 중... ${processed}/${nodes.length}`, {
          progress: processed / nodes.length
        });
      }
    }
    
    finishSearch(problems, '현재 페이지');
  } catch (error) {
    handleSearchError(error);
  }
}

// 모든 페이지 검사
function searchAllPages() {
  searchInProgress = true;
  sendMessage('search-start', '모든 페이지를 검사하는 중...');
  
  try {
    const problems = [];
    const pages = figma.root.children.filter(child => child.type === 'PAGE');
    
    let totalNodes = 0;
    let processed = 0;
    
    // 전체 노드 수 계산
    for (const page of pages) {
      try {
        totalNodes += page.findAll(() => true).length;
      } catch (e) {
        console.warn(`페이지 ${page.name} 계산 오류`);
      }
    }
    
    // 각 페이지 검사
    for (const page of pages) {
      try {
        const nodes = page.findAll(() => true);
        
        for (const node of nodes) {
          checkNode(node, problems, page.name);
          processed++;
          
          if (processed % 200 === 0) {
            sendMessage('search-progress', `검사 중... ${processed}/${totalNodes}`, {
              progress: processed / totalNodes
            });
          }
        }
      } catch (e) {
        console.warn(`페이지 ${page.name} 검사 오류`);
      }
    }
    
    finishSearch(problems, '모든 페이지');
  } catch (error) {
    handleSearchError(error);
  }
}

// 노드와 하위 노드들 재귀 검사
function findProblemsInNode(node, problems) {
  try {
    checkNode(node, problems, 'Selected');
    
    if (node.children) {
      for (const child of node.children) {
        findProblemsInNode(child, problems);
      }
    }
  } catch (error) {
    console.warn('노드 검사 오류:', error);
  }
}

// 개별 노드 검사
function checkNode(node, problems, pageName) {
  try {
    // 인스턴스 검사
    if (node.type === 'INSTANCE') {
      if (!node.mainComponent) {
        problems.push({
          id: node.id,
          name: node.name || 'Unnamed',
          issue: '메인 컴포넌트 누락',
          type: 'missing',
          severity: 'high',
          page: pageName,
          nodeType: 'INSTANCE'
        });
      } else if (node.mainComponent.remote) {
        problems.push({
          id: node.id,
          name: node.name || 'Unnamed',
          issue: '원격 컴포넌트',
          type: 'remote',
          severity: 'medium',
          page: pageName,
          nodeType: 'INSTANCE'
        });
      } else if (hasStructuralChanges(node)) {
        problems.push({
          id: node.id,
          name: node.name || 'Unnamed',
          issue: '구조가 변경됨',
          type: 'modified',
          severity: 'medium',
          page: pageName,
          nodeType: 'INSTANCE'
        });
      }
    }
    
    // 컴포넌트 검사
    if (node.type === 'COMPONENT') {
      try {
        if (!node.instances || node.instances.length === 0) {
          problems.push({
            id: node.id,
            name: node.name || 'Unnamed Component',
            issue: '미사용 컴포넌트',
            type: 'unused',
            severity: 'low',
            page: pageName,
            nodeType: 'COMPONENT'
          });
        }
      } catch (e) {
        // instances 접근 오류 무시
      }
    }
    
    // 컴포넌트 세트 검사
    if (node.type === 'COMPONENT_SET') {
      try {
        const variants = node.children || [];
        const hasInstances = variants.some(variant => {
          try {
            return variant.type === 'COMPONENT' && 
                   variant.instances && 
                   variant.instances.length > 0;
          } catch (error) {
            return false;
          }
        });
        
        if (!hasInstances) {
          problems.push({
            id: node.id,
            name: node.name || 'Unnamed Component Set',
            issue: '미사용 컴포넌트 세트',
            type: 'unused',
            severity: 'low',
            page: pageName,
            nodeType: 'COMPONENT_SET'
          });
        }
      } catch (e) {
        // 컴포넌트 세트 분석 오류 무시
      }
    }
  } catch (error) {
    console.warn('노드 검사 오류:', error);
  }
}

// 구조 변경 감지
function hasStructuralChanges(instance) {
  try {
    const mainComponent = instance.mainComponent;
    if (!mainComponent) return false;
    
    // 자식 수 비교
    const instanceChildren = instance.children || [];
    const componentChildren = mainComponent.children || [];
    
    if (instanceChildren.length !== componentChildren.length) {
      return true;
    }
    
    // 오버라이드 확인
    try {
      if (instance.overrides) {
        const overrideCount = Object.keys(instance.overrides).length;
        return overrideCount > 10;
      }
    } catch (e) {
      // overrides 접근 오류 무시
    }
    
    return false;
  } catch (error) {
    return false;
  }
}

// 검색 완료 처리
function finishSearch(problems, scope) {
  searchInProgress = false;
  currentProblems = problems;
  
  // 현재 페이지 노드들만 선택
  const currentNodes = problems
    .filter(p => p.page === figma.currentPage.name || p.page === 'Selected')
    .map(p => {
      try {
        return figma.getNodeById(p.id);
      } catch (e) {
        return null;
      }
    })
    .filter(n => n && n.parent);
  
  if (currentNodes.length > 0) {
    try {
      figma.currentPage.selection = currentNodes;
      figma.viewport.scrollAndZoomIntoView(currentNodes);
    } catch (e) {
      console.warn('노드 선택 오류');
    }
  }
  
  // 결과 분석
  const analysis = analyzeProblems(problems);
  
  sendMessage('search-complete', `${scope}에서 ${problems.length}개의 문제 발견`, {
    problems: problems,
    analysis: analysis,
    scope: scope,
    currentPageCount: currentNodes.length
  });
}

// 검색 오류 처리
function handleSearchError(error) {
  searchInProgress = false;
  console.error('검색 오류:', error);
  sendMessage('error', '검색 중 오류가 발생했습니다.');
}

// 문제 분석
function analyzeProblems(problems) {
  const analysis = {
    total: problems.length,
    bySeverity: { high: 0, medium: 0, low: 0 },
    byType: {},
    byPage: {}
  };
  
  for (const problem of problems) {
    analysis.bySeverity[problem.severity]++;
    analysis.byType[problem.type] = (analysis.byType[problem.type] || 0) + 1;
    analysis.byPage[problem.page] = (analysis.byPage[problem.page] || 0) + 1;
  }
  
  return analysis;
}

// 노드 선택
function selectNode(nodeId) {
  try {
    const node = figma.getNodeById(nodeId);
    if (node) {
      // 페이지 이동
      const page = findPageForNode(node);
      if (page && page !== figma.currentPage) {
        figma.currentPage = page;
      }
      
      figma.currentPage.selection = [node];
      figma.viewport.scrollAndZoomIntoView([node]);
      sendMessage('success', `노드 "${node.name}"를 선택했습니다.`);
    } else {
      sendMessage('error', '노드를 찾을 수 없습니다.');
    }
  } catch (error) {
    sendMessage('error', '노드 선택 실패: ' + error.message);
  }
}

// 인스턴스 분리
function detachInstance(nodeId) {
  try {
    const node = figma.getNodeById(nodeId);
    if (node && node.type === 'INSTANCE') {
      node.detachInstance();
      sendMessage('success', `인스턴스 "${node.name}"를 분리했습니다.`);
      
      // 문제 목록에서 제거
      currentProblems = currentProblems.filter(p => p.id !== nodeId);
      updateProblemsList();
    } else {
      sendMessage('error', '인스턴스 노드가 아니거나 찾을 수 없습니다.');
    }
  } catch (error) {
    sendMessage('error', '인스턴스 분리 실패: ' + error.message);
  }
}

// 노드 삭제
function deleteNode(nodeId) {
  try {
    const node = figma.getNodeById(nodeId);
    if (node) {
      const nodeName = node.name;
      node.remove();
      sendMessage('success', `노드 "${nodeName}"를 삭제했습니다.`);
      
      // 문제 목록에서 제거
      currentProblems = currentProblems.filter(p => p.id !== nodeId);
      updateProblemsList();
    } else {
      sendMessage('error', '노드를 찾을 수 없습니다.');
    }
  } catch (error) {
    sendMessage('error', '노드 삭제 실패: ' + error.message);
  }
}

// 현재 페이지 모든 문제 노드 선택
function selectAllCurrent() {
  try {
    const nodes = currentProblems
      .filter(p => p.page === figma.currentPage.name || p.page === 'Selected')
      .map(p => {
        try {
          return figma.getNodeById(p.id);
        } catch (e) {
          return null;
        }
      })
      .filter(n => n && n.parent);
    
    if (nodes.length > 0) {
      figma.currentPage.selection = nodes;
      figma.viewport.scrollAndZoomIntoView(nodes);
      sendMessage('success', `${nodes.length}개의 문제 노드를 선택했습니다.`);
    } else {
      sendMessage('info', '현재 페이지에 선택할 노드가 없습니다.');
    }
  } catch (error) {
    sendMessage('error', '노드 선택 실패: ' + error.message);
  }
}

// 연결 끊어진 컴포넌트들 일괄 수정
function fixMissingComponents() {
  try {
    let fixedCount = 0;
    const missingProblems = currentProblems.filter(p => p.type === 'missing');
    
    for (const problem of missingProblems) {
      try {
        const node = figma.getNodeById(problem.id);
        if (node && node.type === 'INSTANCE') {
          node.detachInstance();
          fixedCount++;
        }
      } catch (e) {
        console.warn(`수정 실패: ${problem.name}`);
      }
    }
    
    // 수정된 문제들 제거
    currentProblems = currentProblems.filter(p => p.type !== 'missing');
    updateProblemsList();
    
    sendMessage('success', `${fixedCount}개의 연결 끊어진 인스턴스를 분리했습니다.`);
  } catch (error) {
    sendMessage('error', '일괄 수정 실패: ' + error.message);
  }
}

// 미사용 컴포넌트들 일괄 삭제
function fixUnusedComponents() {
  try {
    let deletedCount = 0;
    const unusedProblems = currentProblems.filter(p => p.type === 'unused');
    
    for (const problem of unusedProblems) {
      try {
        const node = figma.getNodeById(problem.id);
        if (node && (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET')) {
          node.remove();
          deletedCount++;
        }
      } catch (e) {
        console.warn(`삭제 실패: ${problem.name}`);
      }
    }
    
    // 삭제된 문제들 제거
    currentProblems = currentProblems.filter(p => p.type !== 'unused');
    updateProblemsList();
    
    sendMessage('success', `${deletedCount}개의 미사용 컴포넌트를 삭제했습니다.`);
  } catch (error) {
    sendMessage('error', '일괄 삭제 실패: ' + error.message);
  }
}

// 문제 목록 업데이트
function updateProblemsList() {
  const analysis = analyzeProblems(currentProblems);
  sendMessage('problems-updated', '문제 목록이 업데이트되었습니다.', {
    problems: currentProblems,
    analysis: analysis
  });
}

// 보고서 내보내기
function exportReport() {
  const report = {
    timestamp: new Date().toISOString(),
    fileName: figma.root.name,
    totalProblems: currentProblems.length,
    analysis: analyzeProblems(currentProblems),
    problems: currentProblems
  };
  
  sendMessage('report-ready', '보고서를 생성했습니다.', report);
}

// 노드가 속한 페이지 찾기
function findPageForNode(node) {
  try {
    let current = node;
    while (current && current.type !== 'PAGE') {
      current = current.parent;
    }
    return current;
  } catch (error) {
    return figma.currentPage;
  }
}

// 초기화 실행
init();

<script>
const problems = ${JSON.stringify(problems.map(p => ({
    id: p.node.id,
    type: p.type,
    name: p.name
  })))};

function msg(action) {
  parent.postMessage({pluginMessage: {action: action, problems: problems}}, '*');
}
</script>
`;
  
  figma.showUI(html, {
    width: 280,
    height: 300,
    title: "작업 옵션"
  });
  
  figma.ui.onmessage = handleActionMessage;
}

// 액션 메시지 처리
function handleActionMessage(msg) {
  figma.ui.close();
  
  const action = msg.action;
  const problems = msg.problems || [];
  
  if (action === 'detach') {
    detachInstances(problems);
  } else if (action === 'delete') {
    deleteComponents(problems);
  } else if (action === 'select') {
    selectProblems(problems);
  } else {
    figma.closePlugin();
  }
}

// 인스턴스 분리
function detachInstances(problems) {
  let count = 0;
  
  for (const p of problems) {
    if (p.type === 'missing') {
      try {
        const node = figma.getNodeById(p.id);
        if (node && node.type === 'INSTANCE') {
          node.detachInstance();
          count++;
        }
      } catch (e) {
        // 분리 실패 무시
      }
    }
  }
  
  figma.notify(`✅ ${count}개 인스턴스 분리 완료`);
  figma.closePlugin();
}

// 컴포넌트 삭제
function deleteComponents(problems) {
  let count = 0;
  
  for (const p of problems) {
    if (p.type === 'unused') {
      try {
        const node = figma.getNodeById(p.id);
        if (node && node.type === 'COMPONENT') {
          node.remove();
          count++;
        }
      } catch (e) {
        // 삭제 실패 무시
      }
    }
  }
  
  figma.notify(`✅ ${count}개 컴포넌트 삭제 완료`);
  figma.closePlugin();
}

// 문제 노드들 선택
function selectProblems(problems) {
  const nodes = [];
  
  for (const p of problems) {
    try {
      const node = figma.getNodeById(p.id);
      if (node && node.parent) {
        nodes.push(node);
      }
    } catch (e) {
      // 노드 접근 실패 무시
    }
  }
  
  if (nodes.length > 0) {
    figma.currentPage.selection = nodes;
    figma.viewport.scrollAndZoomIntoView(nodes);
    figma.notify(`✅ ${nodes.length}개 노드 선택`);
  } else {
    figma.notify('선택할 노드가 없습니다');
  }
  
  figma.closePlugin();
}견되었습니다.`;
  if (currentPageCount > 0) {
    notificationMessage += ` ${currentPageCount}개가 선택되었습니다.`;
  }
  if (otherPageCount > 0) {
    notificationMessage += ` (다른 페이지: ${otherPageCount}개)`;
  }
  
  figma.notify(notificationMessage, { timeout: 8000 });
  
  // 추가 액션 옵션 제공
  if (detachedNodes.length > 0) {
    showActionOptions(detachedNodes, searchScope);
  } else {
    figma.closePlugin(`검사 완료: ${detachedNodes.length}개 문제 발견`);
  }
}

function showActionOptions(detachedNodes, searchScope) {
  // 심각한 문제들만 필터링
  const missingComponentNodes = detachedNodes.filter(node => node.type === 'missing-component');
  const unusedComponentNodes = detachedNodes.filter(node => 
    node.type === 'unused-component' || node.type === 'unused-component-set'
  );
  
  const actionHtml = `
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      
      body {
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
        padding: 20px;
        background: #ffffff;
        color: #333;
        line-height: 1.4;
      }
      
      h2 {
        margin: 0 0 15px 0;
        font-size: 16px;
        font-weight: 600;
      }
      
      p {
        margin: 0 0 20px 0;
        font-size: 12px;
        color: #666;
      }
      
      .button-container {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 20px;
      }
      
      .button {
        padding: 10px;
        border: none;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: opacity 0.2s;
        text-align: left;
      }
      
      .button:hover {
        opacity: 0.8;
      }
      
      .button-danger {
        background: #dc3545;
        color: white;
      }
      
      .button-warning {
        background: #fd7e14;
        color: white;
      }
      
      .button-primary {
        background: #0066ff;
        color: white;
      }
      
      .button-success {
        background: #28a745;
        color: white;
      }
      
      .button-secondary {
        background: #f0f0f0;
        color: #666;
        padding: 8px 16px;
        font-size: 12px;
        width: 100%;
        text-align: center;
      }
    </style>
    
    <div>
      <h2>추가 작업</h2>
      <p>${searchScope}에서 ${detachedNodes.length}개의 문제가 발견되었습니다.</p>
      
      <div class="button-container">
        ${missingComponentNodes.length > 0 ? `
        <button class="button button-danger" onclick="detachMissing()">
          🔗 연결 끊어진 인스턴스 분리 (${missingComponentNodes.length}개)
        </button>
        ` : ''}
        
        ${unusedComponentNodes.length > 0 ? `
        <button class="button button-warning" onclick="deleteUnused()">
          🗑️ 미사용 컴포넌트 삭제 (${unusedComponentNodes.length}개)
        </button>
        ` : ''}
        
        <button class="button button-primary" onclick="selectAllCurrent()">
          ✅ 현재 페이지 문제 노드 모두 선택
        </button>
        
        <button class="button button-success" onclick="exportReport()">
          📊 콘솔에서 상세 보고서 확인
        </button>
      </div>
      
      <button class="button button-secondary" onclick="close()">
        완료
      </button>
    </div>
    
    <script>
      const detachedNodes = ${JSON.stringify(detachedNodes.map(node => ({
        id: node.node.id,
        name: node.name,
        issue: node.issue,
        type: node.type,
        severity: node.severity,
        pageName: node.pageName || 'Current Page'
      })))};
      
      function detachMissing() {
        parent.postMessage({ pluginMessage: { type: 'detach-missing', nodes: detachedNodes } }, '*');
      }
      
      function deleteUnused() {
        parent.postMessage({ pluginMessage: { type: 'delete-unused', nodes: detachedNodes } }, '*');
      }
      
      function selectAllCurrent() {
        parent.postMessage({ pluginMessage: { type: 'select-all-current', nodes: detachedNodes } }, '*');
      }
      
      function exportReport() {
        parent.postMessage({ pluginMessage: { type: 'export-report', nodes: detachedNodes } }, '*');
      }
      
      function close() {
        parent.postMessage({ pluginMessage: { type: 'close' } }, '*');
      }
    </script>
  `;
  
  figma.showUI(actionHtml, { 
    width: 320, 
    height: 400,
    title: "작업 옵션"
  });
  
  // 액션 메시지 처리
  figma.ui.onmessage = async (msg) => {
    switch(msg.type) {
      case 'detach-missing':
        await detachMissingComponents(msg.nodes);
        break;
      case 'delete-unused':
        await deleteUnusedComponents(msg.nodes);
        break;
      case 'select-all-current':
        selectAllCurrentPageNodes(msg.nodes);
        break;
      case 'export-report':
        exportDetailedReport(msg.nodes);
        break;
      case 'close':
        figma.ui.close();
        figma.closePlugin('작업 완료');
        break;
    }
  };
}

// ===========================================
// 액션 함수들
// ===========================================

async function detachMissingComponents(nodeData) {
  figma.ui.close();
  figma.notify('연결 끊어진 인스턴스들을 분리하는 중...');
  
  let detachedCount = 0;
  const missingNodes = nodeData.filter(data => data.type === 'missing-component');
  
  for (const data of missingNodes) {
    try {
      const node = figma.getNodeById(data.id);
      if (node && node.type === 'INSTANCE') {
        node.detachInstance();
        detachedCount++;
      }
    } catch (error) {
      console.warn(`인스턴스 분리 실패: ${data.name}`, error);
    }
  }
  
  figma.notify(`✅ ${detachedCount}개의 인스턴스를 분리했습니다.`, { timeout: 3000 });
  figma.closePlugin(`${detachedCount}개 인스턴스 분리 완료`);
}

async function deleteUnusedComponents(nodeData) {
  figma.ui.close();
  figma.notify('미사용 컴포넌트들을 삭제하는 중...');
  
  let deletedCount = 0;
  const unusedNodes = nodeData.filter(data => 
    data.type === 'unused-component' || data.type === 'unused-component-set'
  );
  
  for (const data of unusedNodes) {
    try {
      const node = figma.getNodeById(data.id);
      if (node && (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET')) {
        node.remove();
        deletedCount++;
      }
    } catch (error) {
      console.warn(`컴포넌트 삭제 실패: ${data.name}`, error);
    }
  }
  
  figma.notify(`✅ ${deletedCount}개의 컴포넌트를 삭제했습니다.`, { timeout: 3000 });
  figma.closePlugin(`${deletedCount}개 컴포넌트 삭제 완료`);
}

function selectAllCurrentPageNodes(nodeData) {
  figma.ui.close();
  
  const currentPageNodes = nodeData
    .filter(data => !data.pageName || data.pageName === 'Current Page' || data.pageName === figma.currentPage.name)
    .map(data => {
      try {
        return figma.getNodeById(data.id);
      } catch (error) {
        return null;
      }
    })
    .filter(node => {
      try {
        return node && node.parent && !node.removed;
      } catch (error) {
        return false;
      }
    });
  
  if (currentPageNodes.length > 0) {
    try {
      figma.currentPage.selection = currentPageNodes;
      figma.viewport.scrollAndZoomIntoView(currentPageNodes);
      figma.notify(`✅ ${currentPageNodes.length}개의 문제 노드를 선택했습니다.`);
    } catch (selectionError) {
      figma.notify('노드 선택 중 오류가 발생했습니다.');
    }
  } else {
    figma.notify('현재 페이지에 선택할 노드가 없습니다.');
  }
  
  figma.closePlugin(`${currentPageNodes.length}개 노드 선택 완료`);
}

function exportDetailedReport(nodeData) {
  figma.ui.close();
  
  console.log('\n=== 📊 상세 보고서 ===');
  console.log(`생성 시간: ${new Date().toLocaleString()}`);
  console.log(`파일명: ${figma.root.name}`);
  console.log(`총 문제 수: ${nodeData.length}`);
  
  // 심각도별 분류
  const bySeverity = nodeData.reduce((acc, node) => {
    acc[node.severity] = (acc[node.severity] || 0) + 1;
    return acc;
  }, {});
  
  console.log('\n심각도별 분류:');
  Object.entries(bySeverity).forEach(([severity, count]) => {
    console.log(`  ${severity}: ${count}개`);
  });
  
  // 타입별 분류
  const byType = nodeData.reduce((acc, node) => {
    acc[node.issue] = (acc[node.issue] || 0) + 1;
    return acc;
  }, {});
  
  console.log('\n문제 타입별 분류:');
  Object.entries(byType).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}개`);
  });
  
  // 페이지별 분류
  const byPage = nodeData.reduce((acc, node) => {
    const page = node.pageName || 'Current Page';
    if (!acc[page]) acc[page] = [];
    acc[page].push(node);
    return acc;
  }, {});
  
  console.log('\n페이지별 상세:');
  Object.entries(byPage).forEach(([page, nodes]) => {
    console.log(`\n📄 ${page} (${nodes.length}개):`);
    nodes.forEach((node, index) => {
      console.log(`  ${index + 1}. ${node.name} - ${node.issue} [${node.severity}]`);
    });
  });
  
  figma.notify('📊 콘솔에서 상세 보고서를 확인하세요. (F12)', { timeout: 5000 });
  figma.closePlugin('보고서 생성 완료');
}

// ===========================================
// 유틸리티 함수들
// ===========================================

function generateSummary(detachedNodes) {
  return detachedNodes.reduce((summary, node) => {
    summary[node.issue] = (summary[node.issue] || 0) + 1;
    return summary;
  }, {});
}

function groupByPage(detachedNodes) {
  return detachedNodes.reduce((groups, node) => {
    const pageName = node.pageName || 'Current Page';
    if (!groups[pageName]) groups[pageName] = [];
    groups[pageName].push(node);
    return groups;
  }, {});
}개의 노드가 선택되어 있습니다.
      </p>
      
      <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
        <button id="searchSelected" style="padding: 12px; background: #007aff; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer;">
          🎯 선택된 노드만 검사 (${selection.length}개)
        </button>
        <button id="searchPage" style="padding: 12px; background: #34c759; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer;">
          📄 전체 페이지 검사
        </button>
        <button id="searchAllPages" style="padding: 12px; background: #ff9500; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer;">
          📚 모든 페이지 검사
        </button>
      </div>
      
      <button id="cancel" style="padding: 8px 16px; background: #f0f0f0; color: #666; border: none; border-radius: 4px; font-size: 12px; cursor: pointer;">
        취소
      </button>
    </div>
    
    <script>
      document.getElementById('searchSelected').onclick = () => {
        parent.postMessage({ pluginMessage: { type: 'search-selected' } }, '*');
      };
      document.getElementById('searchPage').onclick = () => {
        parent.postMessage({ pluginMessage: { type: 'search-page' } }, '*');
      };
      document.getElementById('searchAllPages').onclick = () => {
        parent.postMessage({ pluginMessage: { type: 'search-all-pages' } }, '*');
      };
      document.getElementById('cancel').onclick = () => {
        parent.postMessage({ pluginMessage: { type: 'cancel' } }, '*');
      };
    </script>
  `, { 
    width: 300, 
    height: 250,
    title: "Detached Component Finder"
  });
  
  // UI 메시지 처리
  figma.ui.onmessage = async (msg) => {
    figma.ui.close();
    
    switch(msg.type) {
      case 'search-selected':
        await searchSelectedNodes();
        break;
      case 'search-page':
        await searchCurrentPage();
        break;
      case 'search-all-pages':
        await searchAllPages();
        break;
      case 'cancel':
        figma.closePlugin();
        break;
    }
  };
  
} else {
  // 선택된 노드가 없는 경우 - 바로 페이지 검사
  figma.notify('선택된 노드가 없습니다. 현재 페이지 전체를 검사합니다.');
  searchCurrentPage();
}

// ===========================================
// 검색 함수들
// ===========================================

// 선택된 노드들만 검사
async function searchSelectedNodes() {
  figma.notify('선택된 노드들을 검사하는 중...');
  
  try {
    const detachedNodes = [];
    
    for (const node of selection) {
      const nodeDetached = await findDetachedInNode(node);
      detachedNodes.push(...nodeDetached);
    }
    
    showResults(detachedNodes, '선택된 노드');
    
  } catch (error) {
    console.error('선택된 노드 검사 오류:', error);
    figma.notify('❌ 검사 중 오류가 발생했습니다.');
    figma.closePlugin('검사 실패');
  }
}

// 현재 페이지 검사
async function searchCurrentPage() {
  figma.notify('현재 페이지를 검사하는 중...');
  
  try {
    const detachedNodes = await findDetachedComponents([figma.currentPage]);
    showResults(detachedNodes, '현재 페이지');
    
  } catch (error) {
    console.error('페이지 검사 오류:', error);
    figma.notify('❌ 검사 중 오류가 발생했습니다.');
    figma.closePlugin('검사 실패');
  }
}

// 모든 페이지 검사
async function searchAllPages() {
  figma.notify('모든 페이지를 검사하는 중...');
  
  try {
    const allPages = figma.root.children.filter(child => child.type === 'PAGE');
    const detachedNodes = await findDetachedComponents(allPages);
    showResults(detachedNodes, '모든 페이지');
    
  } catch (error) {
    console.error('전체 검사 오류:', error);
    figma.notify('❌ 검사 중 오류가 발생했습니다.');
    figma.closePlugin('검사 실패');
  }
}

// ===========================================
// 핵심 검사 로직
// ===========================================

// 특정 노드와 그 하위 노드들을 검사
async function findDetachedInNode(node) {
  const detachedNodes = [];
  
  try {
    // 현재 노드 검사
    const nodeIssue = analyzeNode(node);
    if (nodeIssue) {
      detachedNodes.push(nodeIssue);
    }
    
    // 하위 노드들 재귀적으로 검사
    if ('children' in node && node.children) {
      for (const child of node.children) {
        const childDetached = await findDetachedInNode(child);
        detachedNodes.push(...childDetached);
      }
    }
    
  } catch (error) {
    console.warn('노드 검사 오류:', error);
  }
  
  return detachedNodes;
}

// 페이지들을 검사
async function findDetachedComponents(pages) {
  const detachedNodes = [];
  let totalNodes = 0;
  let processedNodes = 0;
  
  // 전체 노드 수 계산
  for (const page of pages) {
    totalNodes += page.findAll(node => true).length;
  }
  
  for (const page of pages) {
    try {
      const allNodes = page.findAll(node => true);
      
      for (const node of allNodes) {
        try {
          const nodeIssue = analyzeNode(node);
          if (nodeIssue) {
            detachedNodes.push({
              ...nodeIssue,
              pageName: page.name,
              pageId: page.id
            });
          }
        } catch (nodeError) {
          console.warn('노드 분석 오류:', nodeError);
        }
        
        processedNodes++;
        
        // 진행 상황 알림 (1000개마다)
        if (processedNodes % 1000 === 0) {
          figma.notify(`검사 중... ${processedNodes}/${totalNodes}`);
        }
      }
      
    } catch (pageError) {
      console.error(`페이지 ${page.name} 검사 오류:`, pageError);
    }
  }
  
  return detachedNodes;
}

// 개별 노드 분석
function analyzeNode(node) {
  try {
    // 인스턴스 노드 체크
    if (node.type === 'INSTANCE') {
      if (!node.mainComponent) {
        return {
          node: node,
          name: node.name || 'Unnamed',
          issue: '메인 컴포넌트 누락',
          severity: 'high',
          type: 'missing-component'
        };
      } else if (node.mainComponent.remote) {
        return {
          node: node,
          name: node.name || 'Unnamed',
          issue: '원격 컴포넌트',
          severity: 'medium',
          type: 'remote-component'
        };
      } else if (hasStructuralChanges(node)) {
        return {
          node: node,
          name: node.name || 'Unnamed',
          issue: '구조가 변경됨',
          severity: 'medium',
          type: 'structural-changes'
        };
      }
    }
    
    // 컴포넌트 노드 체크
    if (node.type === 'COMPONENT') {
      const instances = node.instances || [];
      if (instances.length === 0) {
        return {
          node: node,
          name: node.name || 'Unnamed Component',
          issue: '미사용 컴포넌트',
          severity: 'low',
          type: 'unused-component'
        };
      }
    }
    
    // 컴포넌트 세트 체크
    if (node.type === 'COMPONENT_SET') {
      const variants = node.children || [];
      const hasInstances = variants.some(variant => 
        variant.type === 'COMPONENT' && variant.instances && variant.instances.length > 0
      );
      
      if (!hasInstances) {
        return {
          node: node,
          name: node.name || 'Unnamed Component Set',
          issue: '미사용 컴포넌트 세트',
          severity: 'low',
          type: 'unused-component-set'
        };
      }
    }
    
  } catch (error) {
    console.warn('노드 분석 중 오류:', error);
    return {
      node: node,
      name: node.name || 'Unnamed',
      issue: '분석 오류: ' + error.message,
      severity: 'low',
      type: 'analysis-error'
    };
  }
  
  return null;
}

// 구조 변경 감지
function hasStructuralChanges(instance) {
  try {
    const mainComponent = instance.mainComponent;
    if (!mainComponent) return false;
    
    // 자식 수 비교
    const instanceChildren = instance.children || [];
    const componentChildren = mainComponent.children || [];
    
    if (instanceChildren.length !== componentChildren.length) {
      return true;
    }
    
    // 오버라이드 확인
    if (instance.overrides) {
      const overrideCount = Object.keys(instance.overrides).length;
      return overrideCount > 10; // 임의 기준
    }
    
    return false;
    
  } catch (error) {
    return false;
  }
}

// ===========================================
// 결과 표시 및 처리
// ===========================================

function showResults(detachedNodes, searchScope) {
  if (detachedNodes.length === 0) {
    figma.notify(`✅ ${searchScope}에서 문제가 발견되지 않았습니다!`, { timeout: 3000 });
    figma.closePlugin('검사 완료: 문제 없음');
    return;
  }
  
  // 문제 노드들을 선택 (현재 페이지의 노드만)
  const currentPageNodes = detachedNodes
    .filter(item => !item.pageId || item.pageId === figma.currentPage.id)
    .map(item => item.node)
    .filter(node => node && node.parent && !node.removed);
  
  if (currentPageNodes.length > 0) {
    figma.currentPage.selection = currentPageNodes;
    figma.viewport.scrollAndZoomIntoView(currentPageNodes);
  }
  
  // 결과 요약 생성
  const summary = generateSummary(detachedNodes);
  
  // 결과 메시지
  let resultMessage = `🔍 ${searchScope}에서 ${detachedNodes.length}개의 문제가 발견되었습니다:\n`;
  Object.entries(summary).forEach(([issue, count]) => {
    resultMessage += `• ${issue}: ${count}개\n`;
  });
  
  console.log('=== 검사 결과 ===');
  console.log(resultMessage);
  console.log('=== 상세 정보 ===');
  
  // 페이지별로 그룹화하여 출력
  const byPage = groupByPage(detachedNodes);
  Object.entries(byPage).forEach(([pageName, nodes]) => {
    console.log(`\n📄 페이지: ${pageName}`);
    nodes.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.name} - ${item.issue} [${item.severity}]`);
    });
  });
  
  // 사용자 알림
  const currentPageCount = currentPageNodes.length;
  const otherPageCount = detachedNodes.length - currentPageCount;
  
  let notificationMessage = `⚠️ 총 ${detachedNodes.length}개의 문제가 발견되었습니다.`;
  if (currentPageCount > 0) {
    notificationMessage += ` ${currentPageCount}개가 선택되었습니다.`;
  }
  if (otherPageCount > 0) {
    notificationMessage += ` (다른 페이지: ${otherPageCount}개)`;
  }
  
  figma.notify(notificationMessage, { timeout: 8000 });
  
  // 추가 액션 옵션 제공
  if (detachedNodes.length > 0) {
    showActionOptions(detachedNodes, searchScope);
  } else {
    figma.closePlugin(`검사 완료: ${detachedNodes.length}개 문제 발견`);
  }
}

function showActionOptions(detachedNodes, searchScope) {
  // 심각한 문제들만 필터링
  const highSeverityNodes = detachedNodes.filter(node => node.severity === 'high');
  const missingComponentNodes = detachedNodes.filter(node => node.type === 'missing-component');
  const unusedComponentNodes = detachedNodes.filter(node => node.type === 'unused-component' || node.type === 'unused-component-set');
  
  figma.showUI(`
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px;">
      <h2 style="margin: 0 0 15px 0; font-size: 16px;">추가 작업</h2>
      <p style="margin: 0 0 20px 0; font-size: 12px; color: #666;">
        ${searchScope}에서 ${detachedNodes.length}개의 문제가 발견되었습니다.
      </p>
      
      <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px;">
        ${missingComponentNodes.length > 0 ? `
        <button id="detachMissing" style="padding: 10px; background: #ff3b30; color: white; border: none; border-radius: 6px; font-size: 12px; cursor: pointer;">
          🔗 연결 끊어진 인스턴스 분리 (${missingComponentNodes.length}개)
        </button>
        ` : ''}
        
        ${unusedComponentNodes.length > 0 ? `
        <button id="deleteUnused" style="padding: 10px; background: #ff9500; color: white; border: none; border-radius: 6px; font-size: 12px; cursor: pointer;">
          🗑️ 미사용 컴포넌트 삭제 (${unusedComponentNodes.length}개)
        </button>
        ` : ''}
        
        <button id="selectAllCurrent" style="padding: 10px; background: #007aff; color: white; border: none; border-radius: 6px; font-size: 12px; cursor: pointer;">
          ✅ 현재 페이지 문제 노드 모두 선택
        </button>
        
        <button id="exportReport" style="padding: 10px; background: #34c759; color: white; border: none; border-radius: 6px; font-size: 12px; cursor: pointer;">
          📊 콘솔에서 상세 보고서 확인
        </button>
      </div>
      
      <button id="close" style="padding: 8px 16px; background: #f0f0f0; color: #666; border: none; border-radius: 4px; font-size: 12px; cursor: pointer; width: 100%;">
        완료
      </button>
    </div>
    
    <script>
      const detachedNodes = ${JSON.stringify(detachedNodes.map(node => ({
        id: node.node.id,
        name: node.name,
        issue: node.issue,
        type: node.type,
        severity: node.severity,
        pageName: node.pageName || 'Current Page'
      })))};
      
      document.getElementById('detachMissing')?.addEventListener('click', () => {
        parent.postMessage({ pluginMessage: { type: 'detach-missing', nodes: detachedNodes } }, '*');
      });
      
      document.getElementById('deleteUnused')?.addEventListener('click', () => {
        parent.postMessage({ pluginMessage: { type: 'delete-unused', nodes: detachedNodes } }, '*');
      });
      
      document.getElementById('selectAllCurrent')?.addEventListener('click', () => {
        parent.postMessage({ pluginMessage: { type: 'select-all-current', nodes: detachedNodes } }, '*');
      });
      
      document.getElementById('exportReport')?.addEventListener('click', () => {
        parent.postMessage({ pluginMessage: { type: 'export-report', nodes: detachedNodes } }, '*');
      });
      
      document.getElementById('close').addEventListener('click', () => {
        parent.postMessage({ pluginMessage: { type: 'close' } }, '*');
      });
    </script>
  `, { 
    width: 320, 
    height: 400,
    title: "작업 옵션"
  });
  
  // 액션 메시지 처리
  figma.ui.onmessage = async (msg) => {
    switch(msg.type) {
      case 'detach-missing':
        await detachMissingComponents(msg.nodes);
        break;
      case 'delete-unused':
        await deleteUnusedComponents(msg.nodes);
        break;
      case 'select-all-current':
        selectAllCurrentPageNodes(msg.nodes);
        break;
      case 'export-report':
        exportDetailedReport(msg.nodes);
        break;
      case 'close':
        figma.ui.close();
        figma.closePlugin('작업 완료');
        break;
    }
  };
}

// ===========================================
// 액션 함수들
// ===========================================

async function detachMissingComponents(nodeData) {
  figma.ui.close();
  figma.notify('연결 끊어진 인스턴스들을 분리하는 중...');
  
  let detachedCount = 0;
  const missingNodes = nodeData.filter(data => data.type === 'missing-component');
  
  for (const data of missingNodes) {
    try {
      const node = figma.getNodeById(data.id);
      if (node && node.type === 'INSTANCE') {
        node.detachInstance();
        detachedCount++;
      }
    } catch (error) {
      console.warn(`인스턴스 분리 실패: ${data.name}`, error);
    }
  }
  
  figma.notify(`✅ ${detachedCount}개의 인스턴스를 분리했습니다.`, { timeout: 3000 });
  figma.closePlugin(`${detachedCount}개 인스턴스 분리 완료`);
}

async function deleteUnusedComponents(nodeData) {
  figma.ui.close();
  figma.notify('미사용 컴포넌트들을 삭제하는 중...');
  
  let deletedCount = 0;
  const unusedNodes = nodeData.filter(data => 
    data.type === 'unused-component' || data.type === 'unused-component-set'
  );
  
  for (const data of unusedNodes) {
    try {
      const node = figma.getNodeById(data.id);
      if (node && (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET')) {
        node.remove();
        deletedCount++;
      }
    } catch (error) {
      console.warn(`컴포넌트 삭제 실패: ${data.name}`, error);
    }
  }
  
  figma.notify(`✅ ${deletedCount}개의 컴포넌트를 삭제했습니다.`, { timeout: 3000 });
  figma.closePlugin(`${deletedCount}개 컴포넌트 삭제 완료`);
}

function selectAllCurrentPageNodes(nodeData) {
  figma.ui.close();
  
  const currentPageNodes = nodeData
    .filter(data => !data.pageName || data.pageName === 'Current Page' || data.pageName === figma.currentPage.name)
    .map(data => figma.getNodeById(data.id))
    .filter(node => node && node.parent && !node.removed);
  
  if (currentPageNodes.length > 0) {
    figma.currentPage.selection = currentPageNodes;
    figma.viewport.scrollAndZoomIntoView(currentPageNodes);
    figma.notify(`✅ ${currentPageNodes.length}개의 문제 노드를 선택했습니다.`);
  } else {
    figma.notify('현재 페이지에 선택할 노드가 없습니다.');
  }
  
  figma.closePlugin(`${currentPageNodes.length}개 노드 선택 완료`);
}

function exportDetailedReport(nodeData) {
  figma.ui.close();
  
  console.log('\n=== 📊 상세 보고서 ===');
  console.log(`생성 시간: ${new Date().toLocaleString()}`);
  console.log(`파일명: ${figma.root.name}`);
  console.log(`총 문제 수: ${nodeData.length}`);
  
  // 심각도별 분류
  const bySeverity = nodeData.reduce((acc, node) => {
    acc[node.severity] = (acc[node.severity] || 0) + 1;
    return acc;
  }, {});
  
  console.log('\n심각도별 분류:');
  Object.entries(bySeverity).forEach(([severity, count]) => {
    console.log(`  ${severity}: ${count}개`);
  });
  
  // 타입별 분류
  const byType = nodeData.reduce((acc, node) => {
    acc[node.issue] = (acc[node.issue] || 0) + 1;
    return acc;
  }, {});
  
  console.log('\n문제 타입별 분류:');
  Object.entries(byType).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}개`);
  });
  
  // 페이지별 분류
  const byPage = nodeData.reduce((acc, node) => {
    const page = node.pageName || 'Current Page';
    if (!acc[page]) acc[page] = [];
    acc[page].push(node);
    return acc;
  }, {});
  
  console.log('\n페이지별 상세:');
  Object.entries(byPage).forEach(([page, nodes]) => {
    console.log(`\n📄 ${page} (${nodes.length}개):`);
    nodes.forEach((node, index) => {
      console.log(`  ${index + 1}. ${node.name} - ${node.issue} [${node.severity}]`);
    });
  });
  
  figma.notify('📊 콘솔에서 상세 보고서를 확인하세요. (F12)', { timeout: 5000 });
  figma.closePlugin('보고서 생성 완료');
}

// ===========================================
// 유틸리티 함수들
// ===========================================

function generateSummary(detachedNodes) {
  return detachedNodes.reduce((summary, node) => {
    summary[node.issue] = (summary[node.issue] || 0) + 1;
    return summary;
  }, {});
}

function groupByPage(detachedNodes) {
  return detachedNodes.reduce((groups, node) => {
    const pageName = node.pageName || 'Current Page';
    if (!groups[pageName]) groups[pageName] = [];
    groups[pageName].push(node);
    return groups;
  }, {});
} 1}. ${item.name} - ${item.issue}`);
    });
    
    figma.closePlugin(`검사 완료: ${detachedNodes.length}개 문제 발견`);
    
  } catch (error) {
    console.error('검사 중 오류:', error);
    figma.notify('❌ 검사 중 오류가 발생했습니다.', { timeout: 3000 });
    figma.closePlugin('검사 실패');
  }
}

// 실행
main();;