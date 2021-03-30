
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
            data.macros = macros.filter(x => game.macros.get(x._id));
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
        if (refresh && ui.macros.element.length>0)
            ui.macros.render(true);
    }
    async delete(refresh=true, deleteAll=false){
        let nextFolder = (this.parent) ? this.parent : this.collection.default;
        if (deleteAll){
            for (let macro of this.content){
                await Macro.delete(macro._id);
                game.customFolders.macro.entries.remove(macro._id);
            }

        }else{           
            for (let macro of this.content){
                await nextFolder.addMacro(macro._id);
            }
            if (this.content?.length>0)
                nextFolder.update(false);
        }
        
        for (let child of this.children){
            if (this.parent){
                await child.moveFolder(this.parent._id,false);
            }else{
                await child.moveToRoot();
            }
        }

        if (this.collection.get(this.id)){
            this.collection.remove(this.id)
        }
        let allFolders = game.settings.get(mod,'mfolders')
        
        delete allFolders[this.id];
        
        await game.settings.set(mod,'mfolders',allFolders)
        if (refresh && ui.macros.element.length>0)
            ui.macros.render(true);
        
    }
    async addMacros(macroList,refresh=true){
        for (let macroId of macroList){
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
        }
        await this.save(refresh);
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
    async removeMacros(macroList,del=false,refresh=true){
        for (let macroId of macroList){
            await this.removeMacroById(macroId,del,refresh);
        }
        await this.save(refresh);
    }
    async removeMacro(macro,del=false,refresh=true){
        this._removeMacro(macro,del);
        if (del){
            game.customFolders.macro.entries.remove(macro._id);
        }else{
            let entry = game.customFolders.macro.entries.get(macro._id);
            let hiddenFolder = this.collection.hidden;
            hiddenFolder._addMacro(entry);
            await hiddenFolder.save(false);
        }
        await this.save(refresh);
    }
    async removeMacroById(macroId,del=false,refresh=true){
        await this.removeMacro(game.customFolders.macro.entries.get(macroId),del,refresh);
    }
    async moveFolder(destId,updateParent = true){
        let destFolder = this.collection.get(destId);
        await this._moveToFolder(destFolder, updateParent);
    }
    async moveToRoot(){
        this.path = []
        this.parent = null
        await this._updatePath()
        await this.save(false);
    }
    _addMacro(macro){
        if (!this.content.some(x => x._id === macro._id)){
            this.content = this.content.concat(macro);
        }
        macro.data.folder =  this._id;
    }
    _removeMacro(macro,del=false){
        this.content = this.content.filter(x => x._id != macro._id);
        
        if (del && macro.data.folder)
            macro.data.folder =  null
    }
    _removeFolder(child){
        this.children = this.children.filter(c => c.id != child.id);
    }
    async _moveToFolder(destFolder, updateParent=true){

        this.path = (destFolder) ? destFolder.path.concat(destFolder.id) : [];
        if (this.parent && updateParent){
            this.parent._removeFolder(this);
            this.parent.save(false); 
        }
        if (destFolder){
            this.parent = destFolder._id;
            this.parent.children = this.parent.children.concat(this);
            this.parent.save(false);
            this.path = this.parent.path.concat(destFolder._id)
        }else{
            this.parent = null;
            this.path = [];
        }
        
        await this.save();
        
        await this._updatePath()
        ui.macros.render(true);
    }
    // Update path of this and all child folders
    async _updatePath(currentFolder=this,parent=this){
        if (currentFolder.id != parent.id){
            currentFolder.path = parent.path.concat(parent.id);
            await currentFolder.update(currentFolder.data,false);
        }
        if (currentFolder.children){
            for (let child of currentFolder.children){
                child._updatePath(child,currentFolder);
            }
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
    set content(c){this.data.macros = c;this.data.macroList = c.map(x => x._id)}

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
    get parent(){return this.collection.get(this.data.parent)}
    set parent(p){this.data.parent = p;}
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
    _onDragHighlight(event){
        if (game.user.isGM){
            super._onDragHighlight(event);
        }
    }
    async checkDeleted(){
        let goneMacros = game.customFolders.macro.entries.filter(x => !game.macros.get(x._id));
        for (let c of goneMacros){
            await c.parent.removeMacro(c,true,false);
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
            this.folders = [...this.constructor.folders].filter(x => x?.content?.find(y => y?.permission > 0) || x.playerDefault === game.userId);
            let toAdd = [];
            for (let folder of this.folders){
                let parent = folder.parent
                while (parent){
                    if (!this.folders.some(x => x._id === parent._id))
                        toAdd.push(parent);
                    parent = parent.parent;
                }
            }
            this.folders =this.folders.concat(toAdd)
            this.entities = [...this.constructor.collection].filter(z => z?.permission > 0);
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
        html.find('.refresh-directory').click(() => {
            game.customFolders.macro = null;
            initFolders();
            ui.macros.render(true);
        })
        // Options below are GM only
        if ( !game.user.isGM ) return;

        // Create Macro
        html.find('.create-macro').click(this._onCreateEntity.bind(this));

        // //Manually set icons in here for now
        // $('#macros .directory-item.folder').each((i,el) => {
        //     let li = $(el);
        //     let folder = game.customFolders.macro.folders.get(li.data("folderId"));
        //     if (folder?.icon){
        //         let oldTag = el.querySelector('i');
        //         let folderCustomIcon = document.createElement('img');
        //         folderCustomIcon.src = folder.icon;
        //         oldTag.parentNode.replaceChild(folderCustomIcon,oldTag);
        //     }
        // });
        
    }

    /** @override */
    _getEntryContextOptions(){
        let x = MacroDirectory.prototype._getEntryContextOptions().filter(x => x.name != "FOLDER.Clear");
        let i = x.findIndex(c => c.name === "SIDEBAR.Delete");

        x[i].callback = async function(li)  {
            const entity = game.macros.get(li.data("entityId"));
            Dialog.confirm({
              title: `${game.i18n.localize("SIDEBAR.Delete")} ${entity.name}`,
              content: game.i18n.localize("SIDEBAR.DeleteConfirm"),
              yes: async () => {
                await entity.delete.bind(entity)()
                  
                game.customFolders.macro = null;
                initFolders(true);
                if (ui.macros.element.length>0)
                    ui.macros.render(true);
                  
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
                await game.customFolders.macro.folders.get(result.data.folder).addMacro(result._id,false);

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
                    title: `${game.i18n.localize("FOLDER.Remove")}: ${folder.name}`,
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
                    Dialog.confirm({
                        title: `${game.i18n.localize("FOLDER.Delete")}: ${folder.name}`,
                        content: game.i18n.localize("FOLDER.DeleteConfirm"),
                        yes: () => folder.delete(true,true),
                        options: {
                            top: Math.min(li[0].offsetTop, window.innerHeight - 350),
                            left: window.innerWidth - 720,
                            width: 400
                        }
                        });
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
        if (!game.user.isGM){
            super._onDragStart(event);
            return;
        }
        let li = event.currentTarget.closest("li");
        if (li.dataset.folderId == 'default')
            return;
        const dragData = li.classList.contains("folder") ?
            { type: "Folder", id: li.dataset.folderId, entity: this.constructor.entity } :
            { type: this.constructor.entity, id: li.dataset.entityId };
        event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
        this._dragType = dragData.type;
    }
    _onDrop(event){
        if (!game.user.isGM)
            return;
        event.stopPropagation();
        let li = event.currentTarget.closest("li.folder");
        if (li) li.classList.remove("droptarget");
        let data;
        try{
            data = JSON.parse(event.dataTransfer.getData('text/plain'));
        }catch(err){
            return;
        }
        if (data.pack){
            super._onDrop(event);
        }
        let folderId = li.dataset.folderId;

        if (folderId){
            if (data.type === this.constructor.entity){
                if (game.customFolders.macro.entries.has(data.id) && game.customFolders.macro.entries.get(data.id).folder != folderId)
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
        if (event.currentTarget.classList.contains('create-entity')){
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
        game.settings.set(mod,'updating',true);
        oldP.bind(this,event,formData)().then(async () => {
            await game.settings.set(mod,'updating',false)
            if (ui.macros.element.length>0)
                ui.macros.render(true)
        });
    }
    else{
        return oldP.bind(this,event,formData)();
    }
}
let old = MacroConfig.prototype._updateObject;
MacroConfig.prototype._updateObject = async function(event,formData){
    let result = await old.bind(this,event,formData)()
    if (event.submitter && !event.submitter.classList.contains("execute") && result.data){
        if (!result || result.length===0)
            result = game.customFolders.macro.entries.get(this.object._id);
        let authorFolder = game.customFolders.macro.folders.getPlayerFolder(result.data.author)
        result.data.folder = this.object.data.folder ? this.object.data.folder : 
            (authorFolder ? authorFolder._id : 'default');
        let existing = game.customFolders.macro.entries.get(result._id);
        if (existing){
            game.customFolders.macro.entries.set(result._id,result);
        }else{
            await game.customFolders.macro.entries.insert(result);
        }
        await game.customFolders.macro.folders.get(result.data.folder).addMacro(result._id)
        
        if (ui.macros.element.length>0)
            ui.macros.render(true);
        return formData;
    }
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
let oldD = Macro.prototype._onDelete;
Macro.prototype._onDelete = async function(){
    oldD.bind(this)();
    if (game.settings.get(mod,'updating')) return;
    game.customFolders.macro = null;
    await initFolders(false);
    if (ui.macros.element.length>0)
        ui.macros.render(true);
}
let oldC = Macro.prototype._onCreate;
Macro.prototype._onCreate = async function(data,options,userId){
    oldC.bind(this)(data,options,userId);
    if (game.settings.get(mod,'updating')) return;
    game.customFolders.macro = null;
    await initFolders(false);
    if (ui.macros.element.length>0)
        ui.macros.render(true);
}
let oldU = Macro.prototype._onUpdate;
Macro.prototype._onUpdate = async function(data,options,userId){
    oldU.bind(this)(data,options,userId);
    if (game.settings.get(mod,'updating')) return;
    game.customFolders.macro = null;
    await initFolders(false);
    if (ui.macros.element.length>0)
        ui.macros.render(true);
}
CONFIG.MacroFolder = {entityClass : MacroFolder};

async function initFolders(refresh=false){
    let allFolders = game.settings.get(mod,'mfolders');
    game.customFolders.macro = {
        folders:new MacroFolderCollection([]),
        entries:new Macros([])
    }
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
    if (Object.keys(allFolders).length == 0 && allFolders.constructor === Object){
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
            await game.customFolders.macro.folders.get(defaultId).addMacro(macroId);
        }else{
            // Macro does not have an entry (because it is new)
            let macroWithFolder = game.macros.get(macroId);

            macroWithFolder.data.folder = defaultId;
            game.customFolders.macro.entries.set(macroId,macroWithFolder)
            await game.customFolders.macro.folders.get(defaultId).addMacro(macroId);
        }
    }
    game.customFolders.macro.folders.default.macroList = game.customFolders.macro.folders.default.macroList.concat(unassigned.map(y => y._id));
    game.customFolders.macro.folders.default.content = game.customFolders.macro.folders.default.macroList.concat(unassigned);
    // Check for removed macros
    let missingMacros = false
    let goneMacros = game.customFolders.macro.entries.filter(x => !game.macros.get(x._id));
    for (let c of goneMacros){
        c.parent.removeMacro(c,true,false);
        missingMacros = true;
    }
    
    // Set child folders
    let allEntries = [...game.customFolders.macro.folders.values()]
    for (let mf of allEntries){
        let directChildren = allEntries.filter(f => f.data?.pathToFolder?.length > 0 && f.data.pathToFolder[f.data.pathToFolder.length-1] === mf._id)
        mf.children = directChildren;
    }

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
        return game.i18n.localize("MF.importExportLabel");
    }
    async getData(options) {
        return {
          exportData:JSON.stringify(game.settings.get(mod,'mfolders')),
          submitText:game.i18n.localize("MF.importConfig")
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
                            if (ui.macros.element.length>0)
                                ui.macros.render(true);
                        }
                        await refreshFolders();
                        ui.notifications.info(game.i18n.localize('MF.folderImportSuccess'));
                    });
                }else{
                    ui.notifications.error(game.i18n.localize('MF.folderImportMaxDepth') +" ("+FOLDER_LIMIT+")")
                }
            }catch(error){ui.notifications.error('MF.folderImportFailure')}
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
        return game.i18n.localize("MF.moveFolder")+': '+this.object.name;
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
        return {
            folder: this.object,
            allFolders: formData,
            submitText: game.i18n.localize("MF.moveFolder")
        }
    }

    async _updateObject(event, formData) {
        let destFolderId = null;
        document.querySelectorAll('#folder-move input[type=\'radio\']').forEach(function(e){
            if (e.checked){
                destFolderId=e.value;
                return;} 
        });

        this.object.moveFolder(destFolderId);
        return;       

        
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
            if (key != 'hidden' && key != 'default'){
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
        deleteText: (this.isEditDialog && this.object._id != 'default')?game.i18n.localize("MF.deleteFolder"):null
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
        if (this.object.data._id != 'default'){
            let macrosToAdd = []
            let macrosToRemove = []

            for (let formEntryId of game.macros.keys()){
                //let formEntryId = entry.collection.replace('.','');
                if (formData[formEntryId] && !this.object?.content?.map(c => c.id)?.includes(formEntryId)){
                    // Box ticked AND macro not in folder
                    macrosToAdd.push(formEntryId);
                }else if (!formData[formEntryId] && this.object?.content?.map(c => c.id)?.includes(formEntryId)){
                    // Box unticked AND macro in folder
                    macrosToRemove.push(formEntryId);
                }
            }
            if (macrosToAdd.length>0)
                await this.object.addMacros(macrosToAdd,false);
            
            if (macrosToRemove.length>0)
                await this.object.removeMacros(macrosToRemove,false);

            if (this.object.data.parent && !game.customFolders.macro.folders.get(this.object._id)){
                await this.object.moveFolder(this.object.data.parent._id);
            }
        }
        await this.object.save();
    }
    showDialog(edit=true){
        this.isEditDialog = edit;
        this.render(true);
    }
}
// ==========================
// Event funtions
// ==========================
class SelectFolderConfig extends FormApplication{
    static get defaultOptions() {
        const options = super.defaultOptions;
        options.id = "select-folder";
        options.template = "modules/macro-folders/templates/select-folder.html";
        options.width = 500;
        return options;
    }
  
    get title() {
        return game.i18n.localize("MF.userFolder")
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
            submitText: game.i18n.localize("MF.selectFolder")
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
            ui.notifications.notify(game.i18n.localize("MF.userFolderUpdated"));
        }
        
    }
    
}
async function createUserFolders(){
    let userFolderId = game.settings.get(mod,'user-folder-location');
    if (userFolderId == null || userFolderId.length===0){
        ui.notifications.error(game.i18n.localize("MF.autoCreateFail"))
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
            name: game.i18n.localize("MF.configuration"),
            label: game.i18n.localize("MF.importExportLabel"),
            icon: 'fas fa-wrench',
            type: ImportExportConfig,
            restricted: true
        });
        game.settings.registerMenu(mod, 'user-folder-location-menu', {
            name: game.i18n.localize("MF.userFolderLoc"),
            icon: 'fas fa-folder',
            label: game.i18n.localize("MF.userFolder"),
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
            name: game.i18n.localize("MF.autoCreateLabel"),
            hint: game.i18n.localize("MF.autoCreateHint"),
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
        game.settings.register(mod,'updating',{
            scope:'client',
            config:false,
            type:Boolean,
            default:false
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
Hooks.on('ready',async function(){
    await Settings.registerSettings();
    
    ui.macros = new MacroFolderDirectory();
    game.macros.apps[1] = ui.macros;
    if (shouldAddExportButtons()){
        Hooks.call('addExportButtonsForCF')
    }
    await initFolders(false);
});
