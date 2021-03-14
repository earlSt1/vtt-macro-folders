
const modName = 'Macro Folders';
const mod = 'macro-folders';
const FOLDER_LIMIT = 8;

// ==========================
// Utility functions
// ==========================
function generateRandomFolderName(){
    return Math.random().toString(36).replace('0.','mfolder_' || '');
}
Handlebars.registerHelper('ifInm', function(elem, macros, options) {
    if(macros.indexOf(elem) > -1) {
      return options.fn(this);
    }
    return options.inverse(this);
});
function alphaSortFolders(folders){
    return folders.sort(function(first,second){
        if (first['titleText']<second['titleText']){
            return -1;
        }
        if ( first['titleText'] > second['titleText']){
          return 1;
        }
        return 0;
    })
}
function alphaSortMacros(macros){
    return macros.sort(function(first,second){
        let firstName = first.data.name;
        let secondName = second.data.name;
        if (firstName < secondName){
            return -1;
        }else if (firstName > secondName){
            return 1;
        }else{
            return 0;
        }
    });
}
function alphaSortMacroKeys(keys){
    return keys.sort(function(k1,k2){
        if (game.macros.get(k1).data.name < game.macros.get(k2).data.name){
            return -1;
        } else if (game.macros.get(k1).data.name > game.macros.get(k2).data.name){
            return 1;
        }
        return 0;
    })
}
function shouldAddExportButtons(){
    let availableCompendium = game.packs.entries.some(e => e.entity === 'Macro' && !e.locked)
    let correctCFVersion = game.modules.get('compendium-folders') != null && game.modules.get('compendium-folders').data.version >= '2.0.0'
    let correctFoundryVersion = game.data.version >= '0.7.3'
    return availableCompendium && correctCFVersion && correctFoundryVersion
}
// ==========================
// Folder object structure
// ==========================
export class MacroFolderCollection extends EntityCollection{
    constructor(...args) {
        super(...args);
    }
    /** @override */
    get entity() {
        return "MacroFolder";
    }
    get hidden(){
        return this.find(f => f.isHidden);
    }
    get default(){
        return this.find(f => f.isDefault);
    }
    getPlayerFolder(pId){
        return this.find(f => f.playerDefault === pId)
    }
    getUserFolder(){
        return this.find(f => game.settings.get(mod,'user-folder-location') === f._id)
    }
}
export class MacroFolder extends Folder{
    constructor(data={}){
        super(mergeObject({
            titleText:'New Folder',
            colorText:'#000000',
            fontColorText:'#FFFFFF',
            type:"Macro",
            _id:'mfolder_'+randomID(10),
            entity:"MacroFolder",
            sorting:'a',
            parent:null,
            pathToFolder:[],
            macroList:[],
            macros:[],
            folderIcon:null,
            expanded:false
        },data));
    }
    _getSaveData(){
        let data = duplicate(this.data);
        delete data.macros;
        delete data.content;
        delete data.children;
        return data;
    }
    /** @override */
    static create(data={}){
        let newFolder = new MacroFolder(data);
        if (!game.customFolders){
            game.customFolders = new Map();
        }
        if (!game.customFolders.macro){
            game.customFolders.macro = {
                folders:new MacroFolderCollection([]),
                entries:new Macros([])
            }
        }
        game.customFolders.macro.folders.insert(newFolder);

        return newFolder;
    }
    static import(data={},macros){
        if (data?.pathToFolder?.length > 0){
            data.parent = data.pathToFolder[data.pathToFolder.length-1];
        }
        if (data.macroList){
            data.macroList = data.macroList.filter(x => game.macros.get(x))
        }
        if (macros){
            data.macros = macros;
        }else{
            data.macros = []
        }
        // Set open state
        data.expanded = game.settings.get(mod,'open-folders').includes(data._id)

        return MacroFolder.create(data);
    }
    // Update using data
    async update(data=this.data,refresh=true){
        this.data = mergeObject(data,this.data)
        // Update game folder
        this.collection.get(this.id).data = this.data;
        await this.save(refresh);
    }
    // Save object state to game.customFolders and settings
    async save(refresh=true){
        if (!this.collection.get(this.id)){
            this.collection.insert(this);
        }
        if (game.user.isGM){
            let allFolders = game.settings.get(mod,'mfolders')
            let currentFolder = allFolders[this.id];
            if (!currentFolder){
                // create folder
                allFolders[this.id] = this._getSaveData();
                
            }else{
                allFolders[this.id] = mergeObject(currentFolder,this._getSaveData());
            }
            await game.settings.set(mod,'mfolders',allFolders)
        }
        game.customFolders.macro.folders.get(this._id).data = duplicate(this.data);
        if (refresh && ui.macros.rendered)
            ui.macros.render(true);
    }
    async delete(refresh=true, deleteAll=false){
        if (deleteAll){
            for (let macro of this.content){
                await Macro.delete(macro._id);
                game.customFolders.macro.entries.remove(macro._id);
            }
        }else{
            let nextFolder = (this.parent) ? this.parent : this.collection.default;
            for (let macro of this.content){
                await nextFolder.addMacro(macro._id);
            }

            if (this.content?.length>0)
                nextFolder.update(false);
        }
        if (this.collection.get(this.id)){
            this.collection.remove(this.id)
        }
        let allFolders = game.settings.get(mod,'mfolders')
        
        delete allFolders[this.id];
        
        await game.settings.set(mod,'mfolders',allFolders)
        if (refresh)
            ui.macros.render(true);
        
    }
    async addMacro(macroId,refresh=true){
        let entry = game.customFolders.macro.entries.get(macroId);
        if (entry){
            //Move from old entry to new entry
            let oldParent = game.customFolders.macro.folders.get(entry.data.folder);
            this._addMacro(entry);
            if (oldParent && oldParent._id != this._id){
                oldParent._removeMacro(entry)
                await oldParent.save(false);
            }
            game.customFolders.macro.entries.set(macroId,entry)
        }else{
            //Create entry and assign to this obj
            entry = game.macros.get(macroId);
            entry.data.folder = this._id;
            game.customFolders.macro.entries.insert(entry);
            this._addMacro(entry);
            
        }
        //update(entry.data);
        await this.save(refresh);
    }
    async removeMacro(macroId,del=false,refresh=true){
        this._removeMacro(macroId,del);
        if (del){
            game.customFolders.macro.entries.remove(macroId);
        }else{
            let entry = game.customFolders.macro.entries.get(macroId);
            let hiddenFolder = this.collection.hidden;
            hiddenFolder._addMacro(entry);
            await hiddenFolder.save(false);
        }
        await this.save(refresh);
    }
    async moveFolder(destId){
        let destFolder = this.collection.get(destId);
        this._moveToFolder(destFolder);
    }
    _addMacro(macro){
        if (!this.data.macroList.includes(macro._id)){
            this.content = this.content.concat(macro);
            this.data.macroList = this.data.macroList.concat(macro._id);
        }
        macro.data.folder =  this._id;
    }
    _removeMacro(macro,del=false){
        this.content = this.content.filter(x => x._id != macro._id);
        this.data.macroList = this.content.map(p => p._id);
        if (del && macro.data.folder)
            macro.data.folder =  null
    }
    _removeFolder(child){
        this.children = this.children.filter(c => c.id != child.id);
    }
    async _moveToFolder(destFolder){

        this.path = (destFolder) ? destFolder.path.concat(destFolder.id) : [];
        if (this.parent){
            this.parent._removeFolder(this);
            this.parent.save(false); 
        }
        if (destFolder){
            this.parent = destFolder._id;
            this.parent.children = this.parent.children.concat(this);
            this.parent.save(false);
        }else{
            this.parent = null;
        }
        
        await this.save();
        
        this._updatePath()
        ui.macros.render(true);
    }
    // Update path of this and all child folders
    async _updatePath(currentFolder=this,parent=this){
        if (currentFolder.id != parent.id){
            currentFolder.path = parent.path.concat(parent.id);
            await currentFolder.update(currentFolder.data,false);
        }
        for (let child of currentFolder.children){
            child._updatePath(child,currentFolder);
        }
    }
    /** @override */
    get collection(){
        return game?.customFolders?.macro?.folders
    }
    /** @override */
    get entity(){return this.data.entity;}

    /** @override */
    get content(){return this.data.macros}

    /** @override */
    set content(c){this.data.macros = c;}

    /** @override */
    get children(){return this.data.children}

    set children(c){this.data.children = c;}
    /** @override */
    static get collection(){
        return game?.customFolders?.macro?.folders
    }

    get name(){return this.data.titleText}
    set name(n){this.data.titleText = n;}
    get color(){return this.data.colorText}
    set color(c){this.data.colorText = c;}
    get fontColor(){return this.data.fontColorText}
    set fontColor(fc){this.data.fontColorText = fc;}
    get icon(){return this.data.folderIcon}
    set icon(i){this.folderIcon = i;}
    get macroList(){return this.data.macroList};
    set macroList(c){this.data.macroList = c}
    set folderIcon(i){this.data.folderIcon = i}
    get path(){return this.data.pathToFolder}
    set path(p){this.data.pathToFolder = p}
    set children(c){this.data.children = c}
    get parent(){return this.collection.get(this.data.parent)}
    set parent(p){this.data.parent = p}
    get isDefault(){return this.id === 'default'}
    get isHidden(){return this.id === 'hidden'}
    set expanded(e){this.data.expanded = e}
    get playerDefault(){return this.data.playerDefault};
    set playerDefault(p){this.data.playerDefault=p}
    // Recursively generate a pretty name
    get pathName(){
        if (this.parent)
            return this.parent.pathName+'/'+this.name
        return this.name;
    }
}
export class MacroFolderDirectory extends MacroDirectory{
    /** @override */
	static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: "macro",
            template: "modules/macro-folders/templates/macro-directory.html",
            title: "Macros",
            dragDrop: [{ dragSelector: ".macro,.macro-folder", dropSelector: ".macro-folder"}],
            filters: [{inputSelector: 'input[name="search"]', contentSelector: ".directory-list"}],
            height:'auto'
      });
    }
    constructor(...args) {
        super(...args);
    }

    async checkDeleted(){
        let goneMacros = game.customFolders.macro.entries.filter(x => !game.macros.get(x._id));
        for (let c of goneMacros){
            await c.parent.removeMacro(c.code,true,false);
        }
    }
    /** @override */
    initialize(){
        //filter out gone macros
        if (!this.constructor.folders && !this.constructor.collection){
            this.folders = [];
            this.entities = [];
        }
        else if (game.user.isGM){
            this.folders = [...this.constructor.folders];
            this.entities = [...this.constructor.collection];
        }else{
            //TODO
            this.folders = [...this.constructor.folders].filter(x => x?.content?.find(y => !y?.pack?.private));
            this.entities = [...this.constructor.collection].filter(z => !z?.pack?.private);
        }
        let tree = this.constructor.setupFolders(this.folders, this.entities);
        
        this.tree = this._sortTreeAlphabetically(tree)
                
    }
    _sortTreeAlphabetically(tree){
        let fn = (a,b) => {
            if (a.name < b.name) return -1;
            if (a.name > b.name) return 1;
            return 0;
        }
        tree.children = tree.children.sort(fn);
        for (let s of tree.children.filter(x => x.children?.length > 1)){
            s.children = s.children.sort(fn);
            
        }
        return tree;
    }
    
    /** @override */
    get entity() {
        return "Macro";
    }
    /** @override */
    static get entity() {
        return "Macro";
    }
    /** @override */
    static get folders(){
        return game.customFolders?.macro?.folders;
    }

    /** @override */
    static get collection() {
        return game.customFolders?.macro?.entries;
    }

    /** @override */
    getData(options) {
        return {
            user: game.user,
            tree: this.tree,
        };
    }
    _onCreateFolder(event) {

        event.preventDefault();
        event.stopPropagation();
        const button = event.currentTarget;
        const parent = game.customFolders.macro.folders.get(button.dataset.parentFolder);
        const data = new MacroFolder();
        if (parent){
            data.path = parent.path.concat(parent.id)
            data.parent = parent;
        }
        const options = {top: button.offsetTop, left: window.innerWidth - 310 - FolderConfig.defaultOptions.width};
        new MacroFolderEditConfig(data, options).showDialog(false);
    }
    /** @override */
    activateListeners(html){
        super.activateListeners(html);

        // // Refresh button
        // html.find('.refresh-directory').click(() => {
        //     game.customFolders.macro = null;
        //     initFolders();
        //     ui.macros.render(true);
        // })
        // Options below are GM only
        if ( !game.user.isGM ) return;

        // Create Macro
        html.find('.create-macro').click(this._onCreateEntity.bind(this));

        //Manually set icons in here for now
        $('#macros .directory-item.folder').each((i,el) => {
            let li = $(el);
            let folder = game.customFolders.macro.folders.get(li.data("folderId"));
            if (folder?.icon){
                let oldTag = el.querySelector('i');
                let folderCustomIcon = document.createElement('img');
                folderCustomIcon.src = folder.icon;
                oldTag.parentNode.replaceChild(folderCustomIcon,oldTag);
            }
        });
        
    }

    /** @override */
    _getEntryContextOptions(){
        if (!game.user.isGM)
            return;
        let x = MacroDirectory.prototype._getEntryContextOptions().filter(x => x.name != "FOLDER.Clear");
        let i = x.findIndex(c => c.name === "SIDEBAR.Delete");
        x[i].callback = async function(li)  {
            const entity = game.macros.get(li.data("entityId"));
            Dialog.confirm({
              title: `${game.i18n.localize("SIDEBAR.Delete")} ${entity.name}`,
              content: game.i18n.localize("SIDEBAR.DeleteConfirm"),
              yes: () => {
                  entity.delete.bind(entity)().then(() => {
                    game.customFolders.macro = null;
                    initFolders(true);
                  })
              },
              options: {
                top: Math.min(li[0].offsetTop, window.innerHeight - 350),
                left: window.innerWidth - 720
              }
            });
        }
        i = x.findIndex(c => c.name === "SIDEBAR.Duplicate");
        x[i].callback = async function(li)  {
            const entity = game.macros.get(li.data("entityId"));
            let originalEntry = game.customFolders.macro.entries.get(entity._id);

            await entity.clone({name: `${entity.name} (Copy)`}).then(async(result) => {
                result.data.folder = originalEntry.data.folder;
                await game.customFolders.macro.folders.get(result.data.folder).addMacro(result._id);

                await initFolders(true);
            });
        }
        return x;
    }
    /** @override */
    _getFolderContextOptions(){
        return[
            {
                name: "FOLDER.Edit",
                icon: '<i class="fas fa-edit"></i>',
                condition: game.user.isGM,
                // TODO 
                callback: header => {
                    const li = header.parent()[0];
                    const folder = game.customFolders.macro.folders.get(li.dataset.folderId);
                    const options = {top: li.offsetTop, left: window.innerWidth - 310 - FolderConfig.defaultOptions.width};
                    new MacroFolderEditConfig(folder, options).showDialog();
                }
            },{
                name: "PERMISSION.Configure",
                icon: '<i class="fas fa-lock"></i>',
                condition: () => game.user.isGM,
                callback: header => {
                  const li = header.parent()[0];
                  const folder = game.customFolders.macro.folders.get(li.dataset.folderId);
                  new PermissionControl(folder, {
                    top: Math.min(li.offsetTop, window.innerHeight - 350),
                    left: window.innerWidth - 720
                  }).render(true);
                }
              },
            {
                name: "FOLDER.Remove",
                icon: '<i class="fas fa-trash"></i>',
                condition: header => { 
                    return game.user.isGM && !game.customFolders.macro.folders.get(header.parent().data("folderId")).isDefault
                },
                callback: header => {
                    const li = header.parent();
                    const folder = game.customFolders.macro.folders.get(li.data("folderId"));
                    // TODO 
                    Dialog.confirm({
                    title: `${game.i18n.localize("FOLDER.Remove")} ${folder.name}`,
                    content: game.i18n.localize("FOLDER.RemoveConfirm"),
                    yes: () => folder.delete(),
                    options: {
                        top: Math.min(li[0].offsetTop, window.innerHeight - 350),
                        left: window.innerWidth - 720,
                        width: 400
                    }
                    });
                }
            },{
                name: "FOLDER.Delete",
                icon: '<i class="fas fa-trash"></i>',
                condition: header => { 
                    return game.user.isGM && !game.customFolders.macro.folders.get(header.parent().data("folderId")).isDefault
                },
                callback: header => {
                    const li = header.parent();
                    const folder = game.customFolders.macro.folders.get(li.data("folderId"));
                    new Dialog({
                        title: "Delete Folder: "+folder.name,
                        content: "<p>Are you sure you want to delete the folder <strong>"+folder.name+"?</strong></p>"
                                +"<p><i>Macros in this folder <strong>will be deleted</strong></i></p>",
                        buttons: {
                            yes: {
                                icon: '<i class="fas fa-check"></i>',
                                label: "Yes",
                                callback: () => folder.delete(true,true)
                            },
                            no: {
                                icon: '<i class="fas fa-times"></i>',
                                label: "No"
                            }
                        }
                    }).render(true);
                }
            },{
                name: "CF.moveFolder",
                icon: '<i class="fas fa-sitemap"></i>',
                condition: header => { 
                    return game.user.isGM && !game.customFolders.macro.folders.get(header.parent().data("folderId")).isDefault
                },
                callback: header => {
                    const li = header.parent();
                    const folder = game.customFolders.macro.folders.get(li.data("folderId"));
                    new MacroFolderMoveDialog(folder,{}).render(true);
                }
            }
        ]
    }
    // _contextMenu(html){
    //     super._contextMenu(html);
    //     //MacroDirectory.prototype._contextMenu(html);
    // }

    /** @override */
	_onDragStart(event) {
        let li = event.currentTarget.closest("li");
        const dragData = li.classList.contains("folder") ?
            { type: "Folder", id: li.dataset.folderId, entity: this.constructor.entity } :
            { type: this.constructor.entity, id: li.dataset.entityId };
        event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
        this._dragType = dragData.type;
    }
    _onDrop(event){
        event.stopPropagation();
        let li = event.currentTarget.closest("li.folder");
        if (li) li.classList.remove("droptarget");
        let data;
        try{
            data = JSON.parse(event.dataTransfer.getData('text/plain'));
        }catch(err){
            return;
        }

        let folderId = li.dataset.folderId;

        if (folderId){
            if (data.type === this.constructor.entity){
                game.customFolders.macro.folders.get(folderId).addMacro(data.id)
            }else if (data.type === 'Folder'){
                // Move folder
                let destFolderId = folderId;
                let movingFolderId = data.id;
                let destFolder = game.customFolders.macro.folders.get(destFolderId);
                let movingFolder = game.customFolders.macro.folders.get(movingFolderId);
                if (!destFolder.isHidden
                    && !destFolder.isDefault
                    && destFolderId != movingFolderId
                    && destFolderId != movingFolder?.parent?.id
                    && ((!destFolder.path?.includes(movingFolderId) && destFolder.path.length > 0)
                        || destFolder.path.length === 0))
                    {
                        movingFolder.moveFolder(destFolderId);
                    }
            }
        }
    }
    async _onCreateEntity(event){
        event.preventDefault();
        event.stopPropagation();
        let parentId = 'default'
        if (!event.currentTarget.classList.contains('create-macro')){
            // is a button on folder
            parentId = event.currentTarget.closest('li')?.dataset?.folderId;
        }
        const name = game.i18n.format("ENTITY.New", {entity: game.i18n.localize("ENTITY.Macro")});
        const macro = await Macro.create({name, type: "chat", scope: "global", folder:parentId}, {temporary: true});
        macro.sheet.render(true);
    }
    // Taken from SidebarDirectory._onSearchFilter()
    // modified slightly for custom data structures
    _onSearchFilter(event, query, html) {
        const isSearch = !!query;
        let entityIds = new Set();
        let folderIds = new Set();
    
        // Match entities and folders
        if ( isSearch ) {
          const rgx = new RegExp(RegExp.escape(query), "i");
    
          // Match entity names
          for ( let e of game.customFolders.macro.entries.entities ) {
            if ( rgx.test(e.name) ) {
              entityIds.add(e.id);
              if ( e.data.folder ) folderIds.add(e.data.folder);
            }
          }
    
          // Match folder tree
          const includeFolders = fids => {
            const folders = this.folders.filter(f => fids.has(f._id));
            const pids = new Set(folders.filter(f => f.data.parent).map(f => f.data.parent));
            if ( pids.size ) {
              pids.forEach(p => folderIds.add(p));
              includeFolders(pids);
            }
          };
          includeFolders(folderIds);
        }
    
        // Toggle each directory item
        for ( let el of html.querySelectorAll(".directory-item,.macro") ) {
    
          // Entities
          if (el.classList.contains("entity")) {
            el.style.display = (!isSearch || entityIds.has(el.dataset.entityId)) ? "" : "none";
          }
    
          // Folders
          if (el.classList.contains("folder")) {
            let match = isSearch && folderIds.has(el.dataset.folderId);
            el.style.display = (!isSearch || match) ? "" : "none";
            if (isSearch && match) el.classList.remove("collapsed");
            else el.classList.toggle("collapsed", !game.folders._expanded[el.dataset.folderId]);
          }
        }
      }

}
// extend _getEntryContextOptions()
//MacroFolderDirectory._getEntryContextOptions = MacroDirectory.prototype._getEntryContextOptions;
let oldP = PermissionControl.prototype._updateObject;
PermissionControl.prototype._updateObject = async function(event,formData){
    if (this.entity instanceof Macro || this.entity instanceof MacroFolder){
        oldP.bind(this,event,formData)().then(() => ui.macros.rendered?ui.macros.render(true):null);
    }
    else{
        return oldP.bind(this,event,formData)();
    }
}
let old = MacroConfig.prototype._updateObject;
MacroConfig.prototype._updateObject = async function(event,formData){
    let result = await old.bind(this,event,formData)()
    let authorFolder = game.customFolders.macro.folders.getPlayerFolder(result.data.author)
    result.data.folder = this.object.data.folder ? this.object.data.folder : 
        (authorFolder ? authorFolder._id : 'default');
    let existing = game.customFolders.macro.entries.get(result._id);
    if (existing){
        game.customFolders.macro.entries.set(result._id,result);
    }else{
        await game.customFolders.macro.entries.insert(result);
        await game.customFolders.macro.folders.get(result.data.folder).addMacro(result._id)
    }
    
    if (ui.macros.rendered)
        ui.macros.render(true);
    return formData;
}
Object.defineProperty(Macro,"folder",{
    get: function folder(){
        if ( !this.data.folder ) return null;
        return game.customFolders.macro.folders.get(this.data.folder);
    },
    set: function folder(fId){
        this.data.folder = fId;
    }
});
CONFIG.MacroFolder = {entityClass : MacroFolder};

async function initFolders(refresh=false){
    let allFolders = game.settings.get(mod,'mfolders');
    game.customFolders.macro = null;
    // let refresh = false;
    let assigned = []
    let toRemove = [];
    if (allFolders.hidden && !allFolders.hidden._id){
        allFolders.hidden._id = 'hidden'
    }
    if (allFolders.default && !allFolders.default._id){
        allFolders.default._id = 'default';
    }
    let init1 = false;
    if (Object.keys(allFolders).length <= 2 && allFolders.constructor === Object){
        // initialize settings
        init1 = true;
        let entityId = {}
  
        allFolders = {
            hidden:{
                macroList:[],
                titleText :'hidden-macros',
                _id:'hidden'
            },
            default:{
                macroList:game.macros.entries.map(m => m._id),
                titleText:'Default',
                _id:'default',
                colorText:'#000000'
            }
        };
    }
    for (let folder of Object.values(allFolders)){
        let macros = []
        folder.macros = []
        for (let macroId of folder.macroList){
            let existingMacro = game.customFolders?.macro?.entries?.get(macroId)
            if (game.macros.has(macroId)){
                if (!existingMacro){
                    let macroWithFolder = game.macros.get(macroId);
                    macroWithFolder.data.folder = folder._id;
                    game.customFolders.macro.entries.insert(macroWithFolder)
                    macros.push(macroWithFolder)
                } else
                    macros.push(existingMacro);
            }else{
                toRemove.push(macroId);
            }
            if (folder._id != 'default')
                assigned.push(macroId);
        }
        let f = MacroFolder.import(folder,macros)
        // refresh flag works like "init" in this case
        if (init1)
            await f.save(false); 

    }
    // Set default folder content
    let unassigned = game.macros.entries.filter(x => !assigned.includes(x._id))
    for (let macroId of unassigned.map(y => y._id)){
        let playerFolder = game.customFolders.macro.folders.getPlayerFolder(game.macros.get(macroId).data.author)
        let defaultId = playerFolder ? playerFolder._id : 'default'
        if (game.customFolders.macro.entries.has(macroId)){
            // Macro has an entry (assigned to default folder) 
            game.customFolders.macro.entries.get(macroId).data.folder = defaultId;
        }else{
            // Macro does not have an entry (because it is new)
            let macroWithFolder = game.macros.get(macroId);

            macroWithFolder.data.folder = defaultId;
            game.customFolders.macro.entries.set(macroId,macroWithFolder)
        }
    }
    game.customFolders.macro.folders.default.macroList = unassigned.map(y => y._id);
    game.customFolders.macro.folders.default.content = unassigned;
    
    // Check for removed macros
    let missingMacros = false
    let goneMacros = game.customFolders.macro.entries.filter(x => !game.macros.get(x._id));
    for (let c of goneMacros){
        c.parent.removeMacro(c._id,true,false);
        missingMacros = true;
    }
    
    
    // Set child folders
    let allEntries = [...game.customFolders.macro.folders.values()]
    for (let mf of allEntries){
        let directChildren = allEntries.filter(f => f.data?.pathToFolder?.length > 0 && f.data.pathToFolder[f.data.pathToFolder.length-1] === mf._id)
        mf.children = directChildren;
    }

    if (game.user.isGM)
        game.settings.set(mod,'mfolders',allFolders);
    // if (refresh){
    //     await ui.macros.render(true);   
    // }

}
export class MacroFolderOld{
    constructor(title,color,path){
        this.title = title;
        this.color = color;
        this.macros = [];
        this.folders = [];
        this.uid=generateRandomFolderName();
        this.pathToFolder = path;
        this.icon = null;
        this.player = null;
    }
    initFromExisting(existing){
        this.title = existing['titleText'];
        this.color = existing['colorText']
        this.macros = existing['macroList'];
        this.folders = existing['folders'];
        this.uid = existing['_id'];
        this.path = existing['pathToFolder'];
        this.icon = existing['folderIcon'];
        this.player = existing['playerDefault']
    }
    get uid(){return this._id;}
    set uid(id){this._id=id;}
    get title(){return this.titleText;}
    get color(){return this.colorText;}
    set title(ntitle){this.titleText = ntitle;}
    set color(ncolor){this.colorText = ncolor;}
    get macros(){return this.macroList;}
    get folders(){return this.folderList;}
    set macros(macros){this.macroList = macros;}
    set folders(folders){this.folderList = folders;}
    get icon(){return this.folderIcon}
    set icon(nIcon){this.folderIcon=nIcon}
    get player(){return this.playerDefault}
    set player(nPlayer){this.playerDefault=nPlayer}

    addMacro(macro){
        this.macros.push(macro);
    }
    addFolder(macroFolder){
        this.folders.push(macroFolder);
    }
    get path(){
        return this.pathToFolder;
    }
    set path(npath){
        this.pathToFolder=npath;
    }
}
// ==========================
// Creation functions

function createNewFolder(path){
    new MacroFolderEditConfig(new MacroFolder('New Folder','',path)).render(true) 
}

function createFolderFromObject(parent,macroFolder, macroElements,prefix,isOpen){
    let folder = document.createElement('li')
    folder.classList.add('macro-entity','macro-folder')
    let header = document.createElement('header')
    header.classList.add('macro-folder-header', 'flexrow')
    header.style.backgroundColor = macroFolder.colorText;
    
    let cogLabel = document.createElement('label');
    let cogIcon = document.createElement('i')
    let cogLink = document.createElement('a')

    cogLabel.setAttribute('title','Edit Folder');
    cogIcon.classList.add('fas','fa-cog','fa-fw')
    cogLink.classList.add('edit-folder')
    cogLabel.appendChild(cogIcon);
    cogLink.appendChild(cogLabel)

    let newFolderLabel = document.createElement('label');
    let newFolderIcon = document.createElement('i');
    let newFolderLink = document.createElement('a');
    
    newFolderLabel.setAttribute('title','Create Subfolder');
    newFolderIcon.classList.add('fas','fa-folder-plus','fa-fw');
    newFolderLink.classList.add('create-folder');

    newFolderLabel.appendChild(newFolderIcon);
    newFolderLink.appendChild(newFolderLabel);

    let moveFolderLabel = document.createElement('label');
    let moveFolderIcon = document.createElement('i');
    let moveFolderLink = document.createElement('a');

    moveFolderLabel.setAttribute('title','Move Folder');
    moveFolderIcon.classList.add('fas','fa-sitemap','fa-fw');
    moveFolderLink.classList.add('move-folder');

    moveFolderLabel.appendChild(moveFolderIcon);
    moveFolderLink.appendChild(moveFolderLabel);

    let macroList = document.createElement('ol');
    macroList.classList.add('macro-list');
    for (let macro of macroElements){
        macroList.appendChild(macro);
    }
    let folderList = document.createElement('ol');
    folderList.classList.add('folder-list');
    let contents = document.createElement('div');
    contents.classList.add('folder-contents');
    contents.appendChild(folderList);
    contents.appendChild(macroList);
    let folderIconHTML = "";
    let folderIcon = null;
    if (macroFolder.folderIcon == null){
        folderIcon = document.createElement('i')
        folderIcon.classList.add('fas','fa-fw')
        if (!isOpen){
            folderIcon.classList.add('fa-folder');
        }else{
            folderIcon.classList.add('fa-folder-open')
        }
        folderIconHTML=folderIcon.outerHTML
    }else{
        let folderCustomIcon = document.createElement('img');
        folderCustomIcon.src = macroFolder.folderIcon;
        folderIconHTML = folderCustomIcon.outerHTML;
    }
    if (!isOpen){
        contents.style.display='none';
        
        //macroList.style.display='none';
        //folderList.style.display='none';
        
        cogLink.style.display='none';

        newFolderLink.style.display='none';
        moveFolderLink.style.display='none';
        
        folder.setAttribute('collapsed','');
    }
    let title = document.createElement('h3')
    title.innerHTML = folderIconHTML+macroFolder.titleText;

    if (macroFolder._id === 'default'){
        moveFolderLink.style.display='none';
        newFolderLink.style.display='none';
    }
    if (!game.user.isGM){
        moveFolderLink.style.display='none';
        newFolderLink.style.display='none';
        cogLink.style.display='none';
    }
    header.appendChild(title);
    header.appendChild(moveFolderLink);
    header.appendChild(newFolderLink);
    header.appendChild(cogLink);
    folder.appendChild(header);
    // folder.appendChild(folderList);
    // folder.appendChild(macroList);
    folder.appendChild(contents);

    folder.setAttribute('data-mfolder-id',macroFolder._id);
    if (macroFolder._id==='default'){
        return folder;
    }else{
        parent.appendChild(folder)
        return null;
    }
}


function createHiddenFolder(prefix,hiddenElements,allMacroElementsDict){
    let tab = document.querySelector(prefix+'.sidebar-tab[data-tab=macros]')
    let folder = document.querySelector('.hidden-macros')
    if (folder==null){
        folder = document.createElement('ol')
        folder.classList.add('hidden-macros');
        folder.style.display='none';
        tab.querySelector(prefix+'ol.directory-list').appendChild(folder);   
    }
    for (let key of hiddenElements){
        if (allMacroElementsDict[key]!= null){
            folder.appendChild(allMacroElementsDict[key])
        }
    }
}
function moveMacroToNewFolder(macroElement,folderId){
    document.querySelector('.macro-folder[data-mfolder-id=\''+folderId+'\'] > .folder-contents > .macro-list').appendChild(macroElement);
}
async function updateDefaultPlayerMacros(remainingElements){
    let allFolders = Settings.getFolders();
    let toDelete = []
    for (let fKey of Object.keys(allFolders)){
        if (allFolders[fKey].playerDefault != null){
            Object.keys(remainingElements).forEach(key => {
                let mId = remainingElements[key].getAttribute('data-entity-id');
                let macro = game.macros.get(mId);
                if (macro != null && allFolders[fKey].playerDefault===macro.data.author){
                    console.log(modName+" | Adding "+macro.data.name+" to default player folder for "+game.users.get(macro.data.author).name);
                    allFolders[fKey].macroList.push(mId);
                    moveMacroToNewFolder(remainingElements[key],fKey);
                    toDelete.push(mId);
                }
            });
        }
    }
    for (let d of toDelete){
        delete remainingElements[d];
    }
    if (game.user.isGM)
        await game.settings.set(mod,'mfolders',allFolders);
    return remainingElements;
}
function insertDefaultFolder(prefix,defaultFolder){
    let allFolders = game.settings.get(mod,'mfolders');
    let allElements = document.querySelectorAll('.sidebar-tab[data-tab=macros] ol.directory-list > li.macro-folder')
    for (let folder of allElements){
        let folderId = folder.getAttribute('data-mfolder-id');
        if (allFolders[folderId].titleText > allFolders['default'].titleText){
            folder.insertAdjacentElement('beforebegin',defaultFolder);
            return;
        }
    }
    allElements[allElements.length - 1].insertAdjacentElement('afterend',defaultFolder);
}
function createDefaultFolder(prefix,defaultFolder,hiddenFolder,remainingElements){

    let tab = document.querySelector(prefix+'.sidebar-tab[data-tab=macros] > ol.directory-list')
    if (document.querySelector('.macro-folder[data-mfolder-id=default]')==null){
        let remainingElementsList = []
        Object.keys(remainingElements).forEach(function(key){
            if (
                (hiddenFolder.macroList == null)
                || (hiddenFolder.macroList != null 
                    && hiddenFolder.macroList.length==0)
                || (hiddenFolder.macroList != null
                    && hiddenFolder.macroList.length>0
                    && !hiddenFolder.macroList.includes(key))){
                console.log(modName+" | Adding "+key+" to default folder")
                remainingElementsList.push(remainingElements[key]);
            }  
        });
        if (remainingElementsList.length>0){
            let openFolders = game.settings.get(mod,'open-folders')
            let folderObject = createFolderFromObject(tab,defaultFolder,remainingElementsList,prefix,openFolders.includes(defaultFolder._id));
            insertDefaultFolder(prefix,folderObject);
        }
    }
}
async function checkForDeletedMacros(){
    let allFolders = game.settings.get(mod,'mfolders');
    let allMacros = Array.from(game.macros.keys())
    let defaultFolderExists = false;
    Object.keys(allFolders).forEach(function (key){
        let macrosToRemove = [];
        for (let folderMacro of allFolders[key].macroList){
            if (!allMacros.includes(folderMacro)){
                macrosToRemove.push(folderMacro);
                console.log(modName+" | Macro "+folderMacro+" no longer exists. Removing from folder "+allFolders[key].titleText)
            }
        }
        for (let toRemove of macrosToRemove){
            let macroIndex = allFolders[key].macroList.indexOf(toRemove);
            allFolders[key].macroList.splice(macroIndex,1);
        }
        if (key === 'default'){
            defaultFolderExists = true;
        }
    });
    if (game.user.isGM){
        if (!defaultFolderExists){
            allFolders['default']={'macroList':[],'titleText':'Default','colorText':'#000000','_id':'default'}
        }
        await game.settings.set(mod,'mfolders',allFolders);
    }
    return allFolders;
}
/*
* Main setup function for macro Folders
* Takes a prefix (a selector to determine whether to modify the Sidebar or Popup window)
* and a list of previously open folders
*/
async function setupFolders(prefix){
    let macroDirectory = document.querySelector('.sidebar-tab#macros')
    let allFolders = await checkForDeletedMacros();
    let openFolders = game.settings.get(mod,'open-folders');

    
    let allMacroElements = macroDirectory.querySelectorAll(prefix+'li.macro.directory-item');

    for (let existingFolder of macroDirectory.querySelectorAll('.macro-folder')){
        existingFolder.remove();
    }
    //Remove hidden macro (so we can add new stuff to it later if from refresh)
    if (macroDirectory.querySelector('.hidden-macros')!=null){
        macroDirectory.querySelector('.hidden-macros').remove();
    }
    if (macroDirectory.querySelector('.macro-folder[data-mfolder-id=default]')!=null){
        macroDirectory.querySelector('.macro-folder[data-mfolder-id=default]').remove();
    }
    let allMacroElementsDict = {}
    // Convert existing macros into dict of format { macroName : macroElement }
    // e.g { dnd5e.monsters : <li class ..... > }
    for (let macroElement of allMacroElements){
        allMacroElementsDict[macroElement.getAttribute('data-entity-id')]=macroElement;
    }

    // For nesting folders, group by depth first.
    // let depth = folder.pathToFolder.length
    // Grouped folders are format {depth:[folders]}
    let groupedFolders = {}
    let parentFolders = [];
    Object.keys(allFolders).forEach(function(key) {
        if (key != 'hidden' && key != 'default'){
            let depth = 0;
            if (allFolders[key].pathToFolder == null){
                depth = 0;
            }else{
                depth = allFolders[key].pathToFolder.length
                // Add all parent folders to list
                // Need to make sure to render them
                for (let segment of allFolders[key].pathToFolder){
                    if (!parentFolders.includes(segment)){
                        parentFolders.push(segment);
                    }
                }
            }
            if (groupedFolders[depth] == null){
                groupedFolders[depth] = [allFolders[key]];
            }else{
                groupedFolders[depth].push(allFolders[key]);
            }
        }
      });
    Object.keys(groupedFolders).sort(function(o1,o2){
        if (parseInt(o1)<parseInt(o2)){
            return -1;
        }else if (parseInt(o1>parseInt(o2))){
            return 1;
        }return 0;
    }).forEach(function(depth){
        // Now loop through folder macros, get them from dict, add to local list, then pass to createFolder
        for (let groupedFolder of alphaSortFolders(groupedFolders[depth])){
            let folder = new MacroFolder('','');
            folder.initFromExisting(groupedFolder);
            folder.uid=groupedFolder._id;

            let macroElements = [];
            if (folder.macroList.length>0){
                for (let macroKey of alphaSortMacroKeys(folder.macroList)){
                    // Check if macro exists in DOM
                    // If it doesnt, ignore
                    let comp = allMacroElementsDict[macroKey]
                    if (comp != null){
                        macroElements.push(comp);
                        delete allMacroElementsDict[macroKey];
                    }
                }
            }
            if (game.user.isGM || (!game.user.isGM && (macroElements.length>0 || parentFolders.includes(folder._id)))){
                
                let rootFolder = macroDirectory.querySelector(prefix+'ol.directory-list')
                if (depth > 0){
                    rootFolder = macroDirectory.querySelector("li.macro-folder[data-mfolder-id='"+folder.pathToFolder[depth-1]+"'] > .folder-contents > ol.folder-list")
                }
                createFolderFromObject(rootFolder,folder,macroElements,prefix, (openFolders.includes(folder._id)));
            }
        }
        
    });
    // Create hidden macro folder
    
    if (allFolders['hidden']!=null 
        && allFolders['hidden'].macroList != null 
        && allFolders['hidden'].macroList.length>0){
        createHiddenFolder(prefix,allFolders['hidden'].macroList,allMacroElementsDict);
    }
    if (Object.keys(allMacroElementsDict).length>0){
        updateDefaultPlayerMacros(allMacroElementsDict)
    }
    // Create default folder
    // Add any remaining macros to this folder (newly added macros)
    // (prevents adding a macro from breaking everything)
    if ((allFolders['default']!=null
        && allFolders['default'].macroList != null
        && allFolders['default'].macroList.length>0)
        ||Object.keys(allMacroElementsDict).length>0){
        createDefaultFolder(prefix,allFolders['default'],allFolders['hidden'],allMacroElementsDict)
    }

    // create folder button
    if (game.user.isGM && macroDirectory.querySelector(prefix+'#macros button.mfolder-create')==null){
        let button = document.createElement('button');
        button.classList.add('mfolder-create')
        button.type='submit';
        button.addEventListener('click',function(){createNewFolder([])});
        let folderIcon = document.createElement('i')
        folderIcon.classList.add('fas','fa-fw','fa-folder')
        button.innerHTML = folderIcon.outerHTML+game.i18n.localize("FOLDER.Create");
        if (game.data.version >= "0.7.5"){
            macroDirectory.querySelector(prefix+'#macros .header-actions.action-buttons').appendChild(button);
        }else{
            macroDirectory.querySelector(prefix+'#macros .directory-footer').appendChild(button);
        }
    }
    // Hide all empty lists
    for (let element of macroDirectory.querySelectorAll('.folder-contents > ol')){
        if (element.innerHTML.length===0){
            element.style.display="none";
        }
    }

}
// Delete functions
function deleteFolder(folder,allFolders){
    let hiddenFolder = allFolders['hidden']
    for (let macro of folder.macroList){
        hiddenFolder.macroList.push(macro);
    }
    Object.keys(allFolders).forEach(function(key){
        if (key != folder._id && key != 'hidden'){
            if (allFolders[key] != null // has not been deleted already
                && allFolders[key].pathToFolder != null
                && allFolders[key].pathToFolder.includes(folder._id)){
                //Delete folders that are children of this folder
                deleteFolder(allFolders[key],allFolders)
                
            }
        }
    });
    delete allFolders[folder._id];
}
async function deleteAllChildFolders(folder){
    let allFolders = Settings.getFolders();
    
    deleteFolder(folder,allFolders)
    await game.settings.set(mod,'mfolders',allFolders);
    ui.notifications.notify("Deleting folder "+folder.titleText+" and all its subfolders");
    refreshFolders()
    
}
class ImportExportConfig extends FormApplication {
    static get defaultOptions() {
        const options = super.defaultOptions;
        options.id = "macro-folder-edit";
        options.template = "modules/macro-folders/templates/import-export.html";
        options.width = 500;
        return options;
      }
    get title() {
        return "Import/Export Folder Configuration";
    }
    async getData(options) {
        return {
          exportData:JSON.stringify(game.settings.get(mod,'mfolders')),
          submitText:'Import'
        }
      }
    async _updateObject(event, formData) {
        let importData = formData.importData;
        if (importData != null && importData.length > 0){
            try{
                let importJson = JSON.parse(importData);
                let success = true;
                Object.keys(importJson).forEach(function(key){
                    if (importJson[key].pathToFolder != null
                        && importJson[key].pathToFolder.length > FOLDER_LIMIT){
                            success = false;
                    }
                });
                if (success){
                    game.settings.set(mod,'mfolders',importJson).then(async function(){
                        if (Object.keys(importJson).length===0){
                            //await createInitialFolder();
                            await initFolders(true);
                            if (ui.macros.rendered)
                                ui.macros.render(true);
                        }
                        await refreshFolders();
                        ui.notifications.info("Folder data imported successfully");
                    });
                }else{
                    ui.notifications.error("Imported string contains folders that exceed max folder limit ("+FOLDER_LIMIT+")")
                }
            }catch(error){ui.notifications.error("Failed to import folder data")}
        }
    }
}
class MacroFolderMoveDialog extends FormApplication {
    static get defaultOptions() {
        const options = super.defaultOptions;
        options.id = "macro-folder-move";
        options.template = "modules/macro-folders/templates/macro-folder-move.html";
        options.width = 500;
        return options;
    }
    get title() {
        return "Move Folder: "+this.object.name;
    }
    async getData(options) { 
        let formData = []
        for (let folder of game.customFolders.macro.folders){
            if (!folder.isHidden 
                && !folder.isDefault 
                && (folder.id != this.object?.parent?.id)
                && (folder.id != this.object.id)
                // Folder path does not contain this.object.id
                && ((!folder.path?.includes(this.object.id) && folder.path.length > 0
                    || folder.path.length === 0)
            
                // Folder is not this
            )){
                formData.push({
                    'titleText':folder.name,
                    'fullPathTitle':folder.pathName,
                    'id':folder.id
                })
            }
        }

        formData.sort(function(first,second){
            if (first.fullPathTitle < second.fullPathTitle){
                return -1
            } else if (first.fullPathTitle > second.fullPathTitle){
                return 1;
            }
            return 0;
        });
        if (this.object.parent){
            formData.splice(0,0,{
                'titleText':'Root',
                'titlePath':'Root',
                'fullPathTitle':'Root',
                'id':'root'
            })
        }
        // let temp = Array.from(formData);
        // for (let obj of temp){
        //     if (obj.id!='root' &&(
        //         // If formData contains folders which are direct parents of this.object
        //         (this.object.pathToFolder != null
        //         && this.object.pathToFolder.length>0
        //         && obj.id === this.object.pathToFolder[this.object.pathToFolder.length-1])
        //         // or If formData contains folders where this.object is directly on the path
        //         || (allFolders[obj.id].pathToFolder != null
        //             && allFolders[obj.id].pathToFolder.includes(this.object._id))
        //         // or If formData contains this.object
        //         || obj.id === this.object._id))
        //         formData.splice(formData.indexOf(obj),1);
        //     }

        return {
            folder: this.object,
            allFolders: formData,
            submitText: "Move Folder"
        }
    }
    updateFullPathForChildren(allFolders,parentFolderId,fullPath){
        let success = true;
        Object.keys(allFolders).forEach(function(key){
            if (allFolders[key].pathToFolder != null
                && allFolders[key].pathToFolder.includes(parentFolderId)
                && key != parentFolderId){

                let temp = allFolders[key].pathToFolder.slice(allFolders[key].pathToFolder.indexOf(parentFolderId),allFolders[key].pathToFolder.length)
                //fullPath.push(parentFolderId);
                allFolders[key].pathToFolder = (fullPath).concat(temp);
                if(allFolders[key].pathToFolder.length+1 >= FOLDER_LIMIT){
                    success = false;
                }

            }
        });
        return success;
    }
    async _updateObject(event, formData) {
        let destFolderId = null;
        document.querySelectorAll('#folder-move input[type=\'radio\']').forEach(function(e){
            if (e.checked){
                destFolderId=e.value;
                return;} 
        });

        this.object.moveFolder(destFolderId);
        //moveFolder(this.object._id,destFolderId,true);
        return;       
        // let allFolders = game.settings.get(mod,'mfolders');
        // let success = false;
        // if (destFolderId != null && destFolderId.length>0){
        //     let notificationDest = ""
        //     if (destFolderId=='root'){
        //         allFolders[this.object._id]['pathToFolder'] = []
        //         success = this.updateFullPathForChildren(allFolders,this.object._id,[])
        //         notificationDest="Root";
        //     }else{
        //         let destParentPath = (allFolders[destFolderId]['pathToFolder']==null)?[]:allFolders[destFolderId]['pathToFolder']
        //         let fullPath = destParentPath.concat([destFolderId]);
        //         allFolders[this.object._id]['pathToFolder'] = fullPath;
        //         success = this.updateFullPathForChildren(allFolders,this.object._id,fullPath)
        //         notificationDest = allFolders[destFolderId].titleText;
        //     }
        //     if (success==true){
        //         ui.notifications.info("Moved folder "+this.object.titleText+" to "+notificationDest)
        //         await game.settings.set(mod,'mfolders',allFolders);
        //         refreshFolders();
        //     }else{
        //         ui.notifications.error("Max folder depth reached ("+FOLDER_LIMIT+")")
        //     }
        // }
        
    }
}
class MacroFolderEditConfig extends FormApplication {
    static get defaultOptions() {
        const options = super.defaultOptions;
        options.id = "macro-folder-edit";
        options.template = "modules/macro-folders/templates/macro-folder-edit.html";
        options.width = 500;
        return options;
    }
  
    get title() {
        if ( this.isEditDialog  ) {
            return `${game.i18n.localize("FOLDER.Update")}: ${this.object.name}`;
        }
        return game.i18n.localize("FOLDER.Create");
    }
    getGroupedMacros(){
        let allFolders = game.settings.get(mod,'mfolders');
        let assigned = {};
        let unassigned = {};
        Object.keys(allFolders).forEach(function(key){
            if (key != 'hidden'){
                for (let a of allFolders[key].macroList){
                    if (Array.from(game.macros.keys()).includes(a)){
                        assigned[a]=game.macros.get(a);
                    }
                }
            }
        });
        for (let macro of game.macros.keys()){
            if (!Object.keys(assigned).includes(macro)){
                unassigned[macro] = game.macros.get(macro);
            }
        }
        return [assigned,unassigned];

    }
    /** @override */
    async getData(options) {
      let allMacros = this.getGroupedMacros();
      return {
        folder: this.object,
        defaultFolder:this.object._id==='default',
        amacros: alphaSortMacros(Object.values(allMacros[0])),
        umacros: alphaSortMacros(Object.values(allMacros[1])),
        players:game.users.entries,
        submitText: game.i18n.localize(this.isEditDialog ? "FOLDER.Update" : "FOLDER.Create"),
        deleteText: (this.isEditDialog && this.object._id != 'default')?"Delete Folder":null
      }
    }
  
    /** @override */
    async _updateObject(event, formData) {
        this.object.name = formData.name;
        if (formData.color.length===0){
            this.object.color = '#000000'; 
        }else{
            this.object.color = formData.color;
        }
        if (formData.fontColor.length === 0){
            this.object.fontColor = '#FFFFFF'
        }else{
            this.object.fontColor = formData.fontColor;
        }
        if (formData.icon != null){
            if (formData.icon.length==0){
                this.object.folderIcon = null;
            }else{
                this.object.folderIcon = formData.icon;
            }
        }else{
            this.object.folderIcon = null;
        }
        if (formData.player != null){
            let existingDefault = game.customFolders.macro.folders.getPlayerFolder(formData.player);
            if (existingDefault){
                existingDefault.playerDefault = null;
                existingDefault.save();
            }
            this.object.playerDefault = formData.player;
        }

        let macrosToAdd = []
        let macrosToRemove = []

        for (let formEntryId of Object.keys(game.macros)){
            //let formEntryId = entry.collection.replace('.','');
            if (formData[formEntryId] && !this.object?.content?.map(c => c.id)?.includes(formEntryId)){
                // Box ticked AND macro not in folder
                macrosToAdd.push(formEntryId);
            }else if (!formData[formEntryId] && this.object?.content?.map(c => c.id)?.includes(formEntryId)){
                // Box unticked AND macro in folder
                macrosToRemove.push(formEntryId);
            }
        }
        for (let macroKey of macrosToAdd){
            await this.object.addMacro(macroKey,false);
        }
        for (let macroKey of macrosToRemove){
            await this.object.removeMacro(macroKey,false,false);
        }
        if (this.object.data.parent && !game.customFolders.macro.folders.get(this.object._id)){
            await this.object.moveFolder(this.object.data.parent._id);
        }
        await this.object.save();
    }
    showDialog(edit=true){
        this.isEditDialog = edit;
        this.render(true);
    }
}
async function refreshFolders(){  
    if (document.querySelector('section#macros') != null){
        await setupFolders('');
        addEventListeners('');
    }
    //Hooks.call('rendermacroDirectory');
}
async function updateFolders(macrosToAdd,macrosToRemove,folder){
    let folderId = folder._id;
    // First find where macro currently is (what folder it belongs to)
    // Then move the macro and update
    let allFolders = Settings.getFolders();
    if (allFolders[folderId] == null){
        allFolders[folderId]=folder;
    }
    let macrosMoved=[]
    for (let macroKey of macrosToAdd){
        Object.keys(allFolders).forEach(function(fId){
            if (allFolders[fId].macroList.indexOf(macroKey)>-1){
                allFolders[fId].macroList.splice(allFolders[fId].macroList.indexOf(macroKey),1);
                console.log(modName+' | Removing '+macroKey+' from folder '+allFolders[fId].titleText);
                if (fId != 'hidden'){
                    macrosMoved.push(macroKey);
                }
            }
        });
        
        allFolders[folderId].macroList.push(macroKey);
        console.log(modName+' | Adding '+macroKey+' to folder '+folder.titleText);
    }
    if (macrosMoved.length>0){
        ui.notifications.notify("Removing "+macrosMoved.length+" macro"+(macrosMoved.length>1?"s from other folders":" from another folder"))
    }
    // For removing macros, add them to hidden macro
    if (macrosToRemove.length>0){
        ui.notifications.notify("Adding "+macrosToRemove.length+" macro"+(macrosToRemove.length>1?"s":"")+" to unassigned/hidden folder");
    }
    for (let macroKey of macrosToRemove){
        allFolders[folderId].macroList.splice(allFolders[folderId].macroList.indexOf(macroKey),1);
        allFolders['hidden'].macroList.push(macroKey);
        console.log(modName+' | Adding '+macroKey+' to folder '+allFolders['hidden'].titleText);
    }
    allFolders[folderId].titleText = folder.titleText;
    allFolders[folderId].colorText = folder.colorText;
    allFolders[folderId].folderIcon = folder.folderIcon;

    if (folder.playerDefault === 'none'){
        allFolders[folderId].playerDefault = null;
    }else{
        let updated = false;
        for (let key of Object.keys(allFolders)){
            if (allFolders[key].playerDefault === folder.playerDefault
                && key != folder._id){
                updated = true;
                ui.notifications.notify("Changing default folder for player "+game.users.get(folder.playerDefault).name);
                allFolders[folderId].playerDefault = folder.playerDefault;
                allFolders[key].playerDefault=null;
            }
        }
        if (!updated && folder.playerDefault!=null && allFolders[folder._id].playerDefault != folder.playerDefault){
            ui.notifications.notify("Setting default folder for player "+game.users.get(folder.playerDefault).name);
            allFolders[folderId].playerDefault = folder.playerDefault;
        }
    }

    await game.settings.set(mod,'mfolders',allFolders);
    refreshFolders()
}
// ==========================
// Event funtions
// ==========================
async function closeFolder(parent,save){
    let folderIcon = parent.firstChild.querySelector('h3 > .fa-folder, .fa-folder-open')
    let cogLink = parent.querySelector('a.edit-folder')
    let newFolderLink = parent.querySelector('a.create-folder');
    let moveFolderLink = parent.querySelector('a.move-folder');
    let contents = parent.querySelector('.folder-contents');
    if (folderIcon != null){
        //Closing folder
        folderIcon.classList.remove('fa-folder-open')
        folderIcon.classList.add('fa-folder') 
    }
    contents.style.display='none'
    if (game.user.isGM){
        cogLink.style.display='none'
        if (parent.getAttribute('data-mfolder-id')!='default'){
            newFolderLink.style.display='none'
        }
        if (parent.getAttribute('data-mfolder-id')!='default'){
            moveFolderLink.style.display='none'
        }
    }
    parent.setAttribute('collapsed','');
    if (save){
        let openFolders = game.settings.get(mod,'open-folders');
        openFolders.splice(openFolders.indexOf(parent.getAttribute('data-mfolder-id')),1);
        await game.settings.set(mod,'open-folders',openFolders);
    }
}
async function openFolder(parent,save){
    let folderIcon = parent.firstChild.querySelector('h3 > .fa-folder, .fa-folder-open')
    let cogLink = parent.querySelector('a.edit-folder')
    let newFolderLink = parent.querySelector('a.create-folder');
    let moveFolderLink = parent.querySelector('a.move-folder');
    let contents = parent.querySelector('.folder-contents');
    if (folderIcon != null){
        folderIcon.classList.remove('fa-folder')
        folderIcon.classList.add('fa-folder-open')
    }
    contents.style.display=''
    if (game.user.isGM){
        cogLink.style.display=''
        if (parent.getAttribute('data-mfolder-id')!='default'){
            newFolderLink.style.display=''
        }
        if (parent.getAttribute('data-mfolder-id')!='default'){
            moveFolderLink.style.display=''
        }
    }
    parent.removeAttribute('collapsed');
    if (save){
        let openFolders = game.settings.get(mod,'open-folders');
        openFolders.push(parent.getAttribute('data-mfolder-id'));
        await game.settings.set(mod,'open-folders',openFolders);
    }
}
async function toggleFolder(event,parent){
    event.stopPropagation();
    let success = true;
    if (parent.hasAttribute('collapsed')){
        await openFolder(parent,true);
    }else{
        await closeFolder(parent,true);
        for (let child of parent.querySelectorAll('.macro-folder')){
            await closeFolder(child,true);
        }
    }
    return success;
}

function showEditDialog(submenu,event){
    event.stopPropagation();
    let allFolders = game.settings.get(mod,'mfolders')
    let folderId = submenu.getAttribute('data-mfolder-id')
    let folderObject = new MacroFolder('','');
    folderObject.initFromExisting(allFolders[folderId]);
    new MacroFolderEditConfig(folderObject).render(true);   
}
function showCreateDialogWithPath(submenu,event){
    event.stopPropagation();
    let directParent = submenu.getAttribute('data-mfolder-id');
    let allFolders = game.settings.get(mod,'mfolders');
    let currentDepth = allFolders[directParent].pathToFolder==null?1:allFolders[directParent].pathToFolder.length
    if (currentDepth + 1 >= FOLDER_LIMIT){
        ui.notifications.error("Max folder depth reached ("+FOLDER_LIMIT+")")
        return
    }
    let path = []
    path.push(directParent);
    let currentElement = submenu;
    while (!currentElement.parentElement.classList.contains('directory-list')){
        currentElement = currentElement.parentElement.parentElement.parentElement;
        path.push(currentElement.getAttribute('data-mfolder-id'));
    }
    path.reverse();
   
    let newFolder = new MacroFolder('New Folder','',path);
    new MacroFolderEditConfig(newFolder).render(true);
}
function showMoveDialog(folder,event){
    let folderId = folder.getAttribute('data-mfolder-id');
    let folderRawObject = game.settings.get(mod,'mfolders')[folderId];
    let folderObject = new MacroFolder('','');
    folderObject.initFromExisting(folderRawObject);
    event.stopPropagation();
    new MacroFolderMoveDialog(folderObject).render(true);
}
function setupDragEventListeners(){
    if (game.user.isGM){
        let window = document.querySelector('.sidebar-tab#macros')
        let hiddenMoveField = document.createElement('input');
        hiddenMoveField.type='hidden'
        hiddenMoveField.style.display='none';
        hiddenMoveField.classList.add('macro-to-move');
        window.querySelector('ol.directory-list').appendChild(hiddenMoveField);
        
        for (let macro of window.querySelectorAll('.directory-item.macro')){
            macro.addEventListener('dragstart',async function(){
                let currentPack = this.getAttribute('data-entity-id');
                this.closest('ol.directory-list').querySelector('input.macro-to-move').value = currentPack
            })
        }
        for (let folder of window.querySelectorAll('.macro-folder')){
            folder.addEventListener('drop',async function(event){
                event.stopPropagation();
                let movingId = this.closest('ol.directory-list').querySelector('input.macro-to-move').value;
                let folderId = this.getAttribute('data-mfolder-id');
                if (movingId.length>0){
                    this.closest('ol.directory-list').querySelector('input.macro-to-move').value = ''
                    let allSettings = game.settings.get(mod,'mfolders');
                    if (!allSettings[folderId].macroList.includes(movingId) && folderId!='default'){
                        for (let key of Object.keys(allSettings)){
                            let currentFolder = allSettings[key];
                            let mList = currentFolder.macroList;
                            if (mList.includes(movingId)){
                                allSettings[key].macroList = mList.filter(c => c != movingId);
                            }
                        }
                        allSettings[folderId].macroList.push(movingId);
                        await game.settings.set(mod,'mfolders',allSettings)
                        refreshFolders();
                    }
                }
            });
        }
    }
}
function addEventListeners(){
    for (let folder of document.querySelectorAll('li.macro-folder')){
        folder.addEventListener('click',function(event){ toggleFolder(event,folder) },false)
        folder.querySelector('a.edit-folder').addEventListener('click',function(event){showEditDialog(folder,event)},false)
        folder.querySelector('a.create-folder').addEventListener('click',function(event){showCreateDialogWithPath(folder,event)},false);
        folder.querySelector('a.move-folder').addEventListener('click',function(event){showMoveDialog(folder,event)},false);
        for (let macro of folder.querySelectorAll('li.macro')){
            macro.addEventListener('click',function(ev){handleMacroClicked(ev,macro)},false)
        }
        eventsSetup.push(folder.getAttribute('data-mfolder-id'))
        
    }
    let search = document.querySelector('#macros .directory-header  input')
    search.addEventListener('keyup',function(ev,searchTerm){handleSearchForFolders(ev,search.value)})
    setupDragEventListeners()
}
//Custom function handling if a macro is clicked while inside a folder
function handleMacroClicked(event,macro){
    event.stopPropagation();
    let macroId = macro.getAttribute('data-entity-id');
    let macroObj = game.macros.get(macroId);
    macroObj.sheet.render(true);
}
function handleSearchForFolders(event,searchTerm){
    //Override default search functionality so we can hide folders
    event.stopPropagation();

    for (let folder of document.querySelectorAll('li.macro-folder')){
        let shouldHide = true;
        for (let macro of folder.querySelectorAll('li.directory-item.macro')){
            if (!macro.innerText.toLowerCase().includes(searchTerm.toLowerCase())){
                macro.style.display = 'none'
            }else{
                macro.style.display = 'flex'
                shouldHide = false;
            }
        }
        if (shouldHide){
            closeFolder(folder,false);
            folder.style.display = 'none';
        }else {
            openFolder(folder,false);
            folder.style.display = '';
        }
        if (searchTerm.length==0){
            closeFolder(folder,false);
            folder.style.display = '';
        }
    }
    
}
class SelectFolderConfig extends FormApplication{
    static get defaultOptions() {
        const options = super.defaultOptions;
        options.id = "select-folder";
        options.template = "modules/macro-folders/templates/select-folder.html";
        options.width = 500;
        return options;
    }
  
    get title() {
        return "Select User Folder"
    }
    /**@override */
    async getData(options){
        let formData = []
        for (let folder of game.customFolders.macro.folders){
            if (!folder.isHidden 
                && !folder.isDefault 
                && (folder.id != this.object?.parent?.id)
                && (folder.id != this.object.id)
                // Folder path does not contain this.object.id
                && ((!folder.path?.includes(this.object.id) && folder.path.length > 0
                    || folder.path.length === 0)
            
                // Folder is not this
            )){
                formData.push({
                    'titleText':folder.name,
                    'fullPathTitle':folder.pathName,
                    'id':folder.id
                })
            }
        }

        formData.sort(function(first,second){
            if (first.fullPathTitle < second.fullPathTitle){
                return -1
            } else if (first.fullPathTitle > second.fullPathTitle){
                return 1;
            }
            return 0;
        });

        return {
            folder: this.object,
            allFolders: formData,
            existingFolder: game.settings.get(mod,'user-folder-location'),
            submitText: "Select Folder"
        }
    }
    /** @override */
    async _updateObject(event, formData) {
        let destFolderId = null;
        document.querySelectorAll('#select-user-folder input[type=\'radio\']').forEach(function(e){
            if (e.checked){
                destFolderId=e.value;
                return;
            } 
        });

        if (destFolderId != null && destFolderId.length>0){
            await game.settings.set(mod,'user-folder-location',destFolderId);
            ui.notifications.notify('User folder updated');
        }
        
    }
    
}
async function createUserFolders(){
    let userFolderId = game.settings.get(mod,'user-folder-location');
    if (userFolderId == null || userFolderId.length===0){
        ui.notifications.error('No user folder defined. Failed to auto-create folders for users')
        return;
    }
   
    let userFolder =  game.customFolders.macro.folders.getUserFolder();

    for (let user of game.users.entries){
        if (!userFolder.children.find(x => x.name === user.name && x.playerDefault === user._id)){
            let existingDefault = game.customFolders.macro.folders.getPlayerFolder(user._id);
            if (existingDefault){
                existingDefault.playerDefault = null;
               await existingDefault.save(false);
            }
            let folderName = user.name;
            let folderColor = user.data.color;
            let folder = MacroFolder.create({
                titleText:folderName,
                colorText:folderColor,
                parent:userFolderId
            })
            folder.playerDefault=user.id
            await folder.save();
            console.log(modName+' | New user detected. Creating user folder for '+folderName);   
        }
    }
}
async function createInitialFolder(){
    if (game.user.isGM){
        let allFolders = game.settings.get(mod,'mfolders');
        allFolders['hidden']={'macroList':[],'titleText':'hidden-macros'};
        allFolders['default']={'macroList':[],'titleText':'Default','colorText':'#000000','_id':'default'};
        let defaultFolder = new MacroFolder('Macros','#000000',[]);
        defaultFolder.macros = Array.from(game.macros.keys());
        allFolders[defaultFolder.uid]=defaultFolder;
        await game.settings.set(mod,'mfolders',allFolders);   
    }
}

export class Settings{
    static updateFolder(folderData){
        let existingFolders = game.settings.get(mod,'mfolders');
        existingFolders[folderData._id]=folderData;
        game.settings.set(mod,'mfolders',existingFolders);
    }
    static updateFolders(folders){
        game.settings.set(mod,'mfolders',folders);
    }
    static addFolder(title,color,macros){
        let existingFolders = game.settings.get(mod,'mfolders');
        let newFolders = existingFolders;
        newFolders.push({'title':title,'color':color,'macros':macros});
        game.settings.set(mod,'mfolders',newFolders);
    }
    static getFolders(){
        return game.settings.get(mod,'mfolders');
    }
    static getPlayerDefaultFolders(){
        let toReturn = []
        let allFolders = game.settings.get(mod,'mfolders');
        for (let folder of allFolders){
            if (folder.playerDefault!=null){
                toReturn.push({'player':folder.playerDefault,'folder':folder});
            }
        }
    }
    static async registerSettings(){
        game.settings.registerMenu(mod,'settingsMenu',{
            name: 'Configuration',
            label: 'Import/Export Configuration',
            icon: 'fas fa-wrench',
            type: ImportExportConfig,
            restricted: true
        });
        game.settings.registerMenu(mod, 'user-folder-location-menu', {
            name: 'User folder location',
            icon: 'fas fa-folder',
            label:'Select User Folder',
            scope: 'world',
            config: true,
            restricted: true,
            type: SelectFolderConfig,
            default:{}
        });
        game.settings.register(mod,'user-folder-location',{
            scope: 'world',
            config: false,
            type: String,
            default:''
        })
        game.settings.register(mod, 'auto-create-user-folders', {
            name: 'Auto create user folders',
            hint: 'If enabled, automatically creates a folder in the User Folder for all users, and sets them as default',
            type: Boolean,
            scope: 'world',
            restricted: true,
            config:true,
            onChange:async (e) => {
                if(e){
                    createUserFolders();
                    await game.settings.set(mod,'auto-create-user-folders',false);
                }
            },
            default:false
        });
        game.settings.register(mod, 'mfolders', {
            scope: 'world',
            config: false,
            type: Object,
            default:{}
        });
        game.settings.register(mod,'open-folders',{
            scope: 'client',
            config:false,
            type: Object,
            default:[]
        });
        if (game.customFolders){
            game.customFolders.macro = {
                    folders:new MacroFolderCollection([]),
                    entries:new Macros([])
            }
        } else {
            game.customFolders = {
                macro:{
                    folders:new MacroFolderCollection([]),
                    entries:new Macros([])
                }
            }
        }

    }
}

// ==========================
// Main hook setup
// ==========================
var eventsSetup = []
Hooks.on('ready',async function(){
    await Settings.registerSettings();
    
    ui.macros = new MacroFolderDirectory();
    if (shouldAddExportButtons()){
        Hooks.call('addExportButtonsForCF')
    }
    await initFolders(false);
});
