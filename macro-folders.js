'use strict';
import {libWrapper} from './shim.js';

const modName = 'Macro Folders';
const mod = 'macro-folders';
const FOLDER_LIMIT = 8;

// ==========================
// Utility functions
// ==========================
Handlebars.registerHelper('ifInm', function(elem, macros, options) {
    if(macros.indexOf(elem) > -1) {
      return options.fn(this);
    }
    return options.inverse(this);
});
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
    let availableCompendium = game.packs.contents.some(e => e.documentClass.documentName === 'Macro' && !e.locked)
    let correctCFVersion = game.modules.get('compendium-folders') != null && game.modules.get('compendium-folders').data.version >= '2.0.0'
    let correctFoundryVersion = game.data.version >= '0.7.3'
    return availableCompendium && correctCFVersion && correctFoundryVersion
}
// ==========================
// Folder object structure
// ==========================
function defineClasses(){
    class MacroEntryCollection extends WorldCollection{
        constructor(...args) {
            super(...args);
        }
        
        get documentClass(){
            return game.MF.MacroEntry;
        }
    }
    class MacroEntry{
        constructor(data={}){
            this.data = foundry.utils.mergeObject({},data);
        }
        get folder(){
            return game.customFolders.macro.folders.get(this.data.folder)
        }
        set folder(fId){
            this.data.folder = fId;
        }
        get macro(){
            return game.macros.get(this.id);
        }
        get id(){
            return this.data._id;
        }
        get permission(){
            if (this.data.permission[game.userId])
                return this.data.permission[game.userId];
            return this.data.permission.default
        }
        toJSON(){
            return this.data;
        }
        get visible(){
            return this.macro?.visible;
        }
        get name(){
            return this.data.name
        }
        get sheet(){
            return this.macro?.sheet;
        }
    }
    class MacroFolderCollection extends WorldCollection{
        constructor(...args) {
            super(...args);
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
            return this.find(f => game.settings.get(mod,'user-folder-location') === f.id)
        }
        get documentClass(){
            return game.MF.MacroFolder;
        }
    }
    class MacroFolder {
        constructor(data={}){
            this.data = foundry.utils.mergeObject({
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
                expanded:false,
                visible:true,
                children:[]
            },data);
            this.apps = [];   
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
                    folders:new game.MF.MacroFolderCollection([]),
                    entries:new game.MF.MacroEntryCollection([])
                }
            }
            game.customFolders.macro.folders.set(newFolder.id,newFolder);

            return newFolder;
        }
        static import(data={},macros){
            if (data?.pathToFolder?.length > 0){
                data.parent = data.pathToFolder[data.pathToFolder.length-1];
            }
            if (macros){
                data.macros = macros;
            }else{
                data.macros = []
            }
            // Set open state
            data.expanded = game.settings.get(mod,'open-folders').includes(data.id)

            return MacroFolder.create(data);
        }
        // Update using data
        async update(data=this.data,refresh=true){
            this.data = foundry.utils.mergeObject(data,this.data)
            // Update game folder
            this.collection.get(this.id).data = this.data;
            await this.save(refresh);
        }
        // Save object state to game.customFolders and settings
        async save(refresh=true){
            if (!this.collection.get(this.id)){
                this.collection.set(this.id,this);
            }
            if (game.user.isGM){
                let allFolders = game.settings.get(mod,'mfolders')
                let currentFolder = allFolders[this.id];
                if (!currentFolder){
                    // create folder
                    allFolders[this.id] = this._getSaveData();
                }else{
                    allFolders[this.id] = foundry.utils.mergeObject(currentFolder,this._getSaveData());
                }
                await game.settings.set(mod,'mfolders',allFolders)
            }
            game.customFolders.macro.folders.get(this.id).data = duplicate(this.data);
            if (refresh && ui.macros.element.length>0){
                ui.macros.customRender();
            }
        }
        async delete(refresh=true, deleteAll=false){
            let nextFolder = (this.parent) ? this.parent : this.collection.default;
            if (deleteAll){
                for (let macro of this.content){
                    game.customFolders.macro.entries.delete(macro.id);
                }
                await Macro.deleteDocuments(this.content.map(e => e.id));

            }else{           
                for (let macro of this.content){
                    await nextFolder.addMacro(macro.id);
                }
                if (this.content?.length>0)
                    nextFolder.update(false);
            }
            
            for (let child of this.children){
                if (this.parent){
                    await child.moveFolder(this.parent.id,false);
                }else{
                    await child.moveToRoot();
                }
            }

            if (this.collection.get(this.id)){
                this.collection.delete(this.id)
            }
            let allFolders = game.settings.get(mod,'mfolders')
            
            delete allFolders[this.id];
            
            await game.settings.set(mod,'mfolders',allFolders)
            if (refresh && ui.macros.element.length>0){
                ui.macros.customRender()
            }
            
        }
        async addMacros(macroList,refresh=true){
            for (let macroId of macroList){
                let entry = game.customFolders.macro.entries.get(macroId);
                if (entry){
                    //Move from old entry to new entry
                    let oldParent = game.customFolders.macro.folders.get(entry.data.folder);
                    this._addMacro(entry);
                    if (oldParent && oldParent.id != this.id){
                        oldParent._removeMacro(entry)
                        await oldParent.save(false);
                    }
                    game.customFolders.macro.entries.set(macroId,entry)
                }else{
                    //Create entry and assign to this obj
                    entry = new game.MF.MacroEntry(game.macros.get(macroId).data);
                    entry.folder = this.id;
                    game.customFolders.macro.entries.set(macroId,entry);
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
                if (oldParent && oldParent.id != this.id){
                    oldParent._removeMacro(entry)
                    await oldParent.save(false);
                }
                game.customFolders.macro.entries.set(macroId,entry)
            }else{
                //Create entry and assign to this obj
                entry = new game.MF.MacroEntry(game.macros.get(macroId).data);
                entry.folder = this.id;
                game.customFolders.macro.entries.set(macroId,entry);
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
                game.customFolders.macro.entries.remove(macro.id);
            }else{
                let entry = game.customFolders.macro.entries.get(macro.id);
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
            if (!this.content.some(x => x.id === macro.id)){
                this.content = this.content.concat(macro);
            }
            macro.data.folder =  this.id;
        }
        _removeMacro(macro,del=false){
            this.content = this.content.filter(x => x.id != macro.id);
            
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
                this.parent = destFolder.id;
                this.parent.children = this.parent.children.concat(this);
                this.parent.save(false);
                this.path = this.parent.path.concat(destFolder.id)
            }else{
                this.parent = null;
                this.path = [];
            }
            
            await this.save();
            
            await this._updatePath()
            ui.macros.customRender()
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
        toJSON(){
            return this.data;
        }
        get isOwner(){
            return game.user.isGM
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
        set content(c){this.data.macros = c;this.data.macroList = c.map(x => x.id)}

        /** @override */
        get children(){return this.data.children}

        set children(c){this.data.children = c;}
        /** @override */
        static get collection(){
            return game?.customFolders?.macro?.folders
        }
        get id(){return this.data._id};
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
        get parentFolder(){return this.collection.get(this.data.parent)}
        set parent(p){this.data.parent = p;}
        get isDefault(){return this.id === 'default'}
        get isHidden(){return this.id === 'hidden'}
        set expanded(e){this.data.expanded = e}
        get playerDefault(){return this.data.playerDefault};
        set playerDefault(p){this.data.playerDefault=p}
        get displayed(){return this.data.visible}
        // Recursively generate a pretty name
        get pathName(){
            if (this.parent)
                return this.parent.pathName+'/'+this.name
            return this.name;
        }

    }
    MacroFolder.prototype.testUserPermission = Macro.prototype.testUserPermission;
    MacroFolder.prototype.getUserLevel = Macro.prototype.getUserLevel;
    let cls = game.modules.get('sidebar-macros')?.active ? SidebarDirectory : MacroDirectory
    class MacroFolderDirectory extends cls{
        /** @override */
        static get defaultOptions() {
            return foundry.utils.mergeObject(super.defaultOptions, {
                id: "macros",
                template: "modules/macro-folders/templates/macro-directory.html",
                title: "Macros",
                dragDrop: [{ dragSelector: ".macro,.macro-folder", dropSelector: ".macro-folder"}],
                filters: [{inputSelector: 'input[name="search"]', contentSelector: ".directory-list"}],
                height:'800'
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
            let goneMacros = game.customFolders.macro.entries.contents.filter(x => !game.macros.get(x.id));
            for (let c of goneMacros){
                await c.parent.removeMacro(c,true,false);
            }
        }

        static documentName = 'Macro';
        /** @override */
        initialize(){
            //filter out gone macros
            if (!this.constructor.folders && !this.constructor.collection){
                this.folders = [];
                this.documents = [];
            }
            else if (game.user.isGM){
                this.folders = [...this.constructor.folders];
                this.documents = [...this.constructor.collection];
            }else{
                //TODO
                this.folders = [...this.constructor.folders].filter(x => x?.content?.find(y => y?.permission > 0) || x.playerDefault === game.userId);
                let toAdd = [];
                for (let folder of this.folders){
                    let parent = folder.parent
                    while (parent){
                        if (!this.folders.some(x => x.id === parent.id) && !toAdd.some(x => x.id === parent.id))
                            toAdd.push(parent);
                        parent = parent.parent;
                    }
                }
                this.folders =this.folders.concat(toAdd)
                this.documents = [...this.constructor.collection].filter(z => z?.permission > 0);
            }
            let tree = this.constructor.setupFolders(this.folders, this.documents);
            
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
                sidebarMacros: game.modules.get('sidebar-macros')?.active
            };
        }
        refresh(){
            initFolders(true);
        }
        customRender(){
            if (!game.modules.get('sidebar-macros')?.active){
                ui.macros.renderPopout(true);
            }else{
                ui.macros.render(true);
            }
        }
        _onCreateFolder(event) {

            event.preventDefault();
            event.stopPropagation();
            const button = event.currentTarget;
            const parent = game.customFolders.macro.folders.get(button.dataset.parentFolder);
            const data = new MacroFolder();
            if (parent){
                data.path = parent.path.concat(parent.id)
                data.parent = parent.id;
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
                initFolders(true);
            })
            // Options below are GM only
            if ( !game.user.isGM ) return;

            // Create Macro
            html.find('.create-entity').click(this._onCreateEntity.bind(this));

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
                title: `${game.i18n.localize("MACRO.Delete")} ${entity.name}`,
                content: `<h4>${game.i18n.localize("AreYouSure")}</h4><p>${game.i18n.localize("MACRO.DeleteWarning")}</p>`,
                yes: async () => {
                    game.customFolders.macro = null;
                    await entity.delete.bind(entity)()
                    
                    
                    initFolders(true);
                    if (ui.macros.element.length>0){
                        ui.macros.customRender()
                    }
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
                let originalEntry = game.customFolders.macro.entries.get(entity.id);
                return entity.clone({name: `${entity.name} (Copy)`,folder: originalEntry.data.folder}, {save: true});
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
                    }).render(true,{editable:true});
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
                            content: `
                                    <p>${game.i18n.localize("AreYouSure")}</p>
                                    <p>${game.i18n.localize("FOLDER.RemoveWarning")}</p>
                                `,
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
                            content: `
                                    <p>${game.i18n.localize("AreYouSure")}</p>
                                    <p>${game.i18n.localize("FOLDER.DeleteWarning")}</p>
                                `,
                            yes: () => folder.delete(true,true),
                            options: {
                                top: Math.min(li[0].offsetTop, window.innerHeight - 350),
                                left: window.innerWidth - 720,
                                width: 400
                            }
                            });
                    }
                },{
                    name: "MF.moveFolder",
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
                { type: "Folder", id: li.dataset.folderId, entity: this.constructor.documentName } :
                { type: this.constructor.documentName, id: li.dataset.entityId };
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
                if (data.type === this.constructor.documentName){
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
            if (!event.currentTarget.parentElement.classList.contains('header-actions')){
                // is a button on folder
                parentId = event.currentTarget.closest('li')?.dataset?.folderId;
            }
            const name = game.i18n.format("ENTITY.New", {entity: game.i18n.localize("ENTITY.Macro")});
            await Macro.create({name, type: "chat", scope: "global",folderId:parentId}, {temporary: true});
        }
        // Taken from SidebarDirectory._onSearchFilter()
        // modified slightly for custom data structures
        _onSearchFilter(event, query, rgx, html) {
            const isSearch = !!query;
            let entityIds = new Set();
            let folderIds = new Set();
        
            // Match entities and folders
            if ( isSearch ) {
            const rgx = new RegExp(RegExp.escape(query), "i");
        
            // Match entity names
            for ( let e of game.customFolders.macro.entries.contents ) {
                if ( rgx.test(e.name) ) {
                entityIds.add(e.id);
                if ( e.data.folder ) folderIds.add(e.data.folder);
                }
            }
        
            // Match folder tree
            const includeFolders = fids => {
                const folders = this.folders.filter(f => fids.has(f.id));
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
        async _handleDroppedDocument(target,data){
            // Taken from foundry.js#24065, slightly modified for MF
            // Determine the closest folder ID
            const closestFolder = target ? target.closest(".folder") : null;
            if ( closestFolder ) closestFolder.classList.remove("droptarget");
            const closestFolderId = closestFolder ? closestFolder.dataset.folderId : null;

            // Obtain the dropped document
            const cls = getDocumentClass(this.constructor.documentName);
            const collection = this.constructor.collection;
            const isSort = collection.has(data.id);
            const document = await cls.fromDropData(data, {importWorld: true});
            if ( !document ) return;

            // Sort relative to another Document
            const sortData = {sortKey: "sort", sortBefore: true};
            const isRelative = target && target.dataset.entityId;
            if ( isRelative ) {
                if ( document.id === target.dataset.entityId ) return; // Don't drop on yourself
                const targetDocument = collection.get(target.dataset.entityId);
                sortData.target = targetDocument;
                sortData.folderId = targetDocument.data.folder;
            }

            // Sort relative to the closest Folder
            else {
            sortData.target = null;
            sortData.folderId = closestFolderId;
            }

            // Determine siblings and perform sort
            sortData.siblings = collection.filter(doc => {
            return (doc.data.folder === sortData.folderId) && (doc.id !== data.id);
            });
            // Macro Folders: Dont send folderId to update (will fail validation checks)
            sortData.updateData = { folder: null };
            
            // Macro Folders: Add macro to correct folder
            await game.customFolders.macro.folders.get(closestFolderId).addMacro(document.id,true)
            return document.sortRelative(sortData);
        }
    }
    //Taken from foundry.js (PermissionControl._updateObject)
    function permissionUpdateForMacroFolder(event,formData){
        event.preventDefault();
        if (!game.user.isGM) throw new Error("You do not have the ability to configure permissions.");
    
        // Collect user permissions
        const perms = {};
        for ( let [user, level] of Object.entries(formData) ) {
            if ( (name !== "default") && (level === -1) ) {
                delete perms[user];
                continue;
            }
            perms[user] = level;
        }
        const cls = Macro
        const updates = this.document.content.map(e => {
            const p = foundry.utils.deepClone(e.data.permission);
            for ( let [k, v] of Object.entries(perms) ) {
                if ( v === -2 ) delete p[k];
                else p[k] = v;
            }
            return {_id: e.id, permission: p}
        });
        return cls.updateDocuments(updates, {diff: false, recursive: false, noHook: true});
    }
    libWrapper.register(mod,'MacroConfig.prototype._updateObject',async function(wrapper, ...args){
        let result = await wrapper(...args);
        if (ui.macros.element.length>0)
            ui.macros.refresh()
        else
            initFolders(false);
        return result;
    },'WRAPPER');
    libWrapper.register(mod,'PermissionControl.prototype._updateObject',async function(wrapper, ...args){
        if (this.document instanceof Macro){
            game.settings.set(mod,'updating',true);
            wrapper(...args).then(async () => {
                await game.settings.set(mod,'updating',false)
                if (ui.macros.element.length>0){
                    game.customFolders.macros = null;
                    initFolders(true);
                }
            });
        } else if (this.document instanceof MacroFolder){
            return permissionUpdateForMacroFolder.bind(this)(...args)
        }else{
            return wrapper(...args);
        }
    },'MIXED');

    libWrapper.register(mod,'Macro.prototype._onDelete',async function(wrapper, ...args){
        let wasMacroInWorld = game.macros.has(this.id) || ui.hotbar.macros.some(x => x.macro?.id === this.id);
        let result = await wrapper(...args);
        if (game.settings.get(mod,'updating') || !wasMacroInWorld) return;
        if (ui.macros.element.length>0)
            ui.macros.refresh();
        else
            initFolders(false);
        return result;
    },'WRAPPER');
    libWrapper.register(mod,'Macro.create',async function(wrapper, ...args){
        let data = [...args][0];
        let isTemporary = [...args][1]?.temporary;
        let isInCompendium = [...args][1]?.pack
        if (!isTemporary && !isInCompendium){
            if (data.folder){
                let folderId = data.folder;
                data.folder = null;
                let result = await wrapper(data,[...args][1]);
                await game.customFolders.macro.folders.get(folderId).addMacro(result.id);
                return result;
            }
        }
        return wrapper(...args);
    },'WRAPPER');
    libWrapper.register(mod,'Macro.prototype._onCreate',async function(wrapper, ...args){
        await wrapper(...args);
        let isMacroInWorld = game.macros.has(this.id) || ui.hotbar.macros.some(x => x.macro?.id === this.id);
        if (game.settings.get(mod,'updating') || !isMacroInWorld) return;
        if (ui.macros.element.length>0)
            ui.macros.refresh();
        else
            initFolders(false);
    },'WRAPPER');

    libWrapper.register(mod,'Macro.prototype._onUpdate',async function(wrapper, ...args){
        await wrapper(...args);
        let isMacroInWorld = game.macros.has(this.id) || ui.hotbar.macros.some(x => x.macro?.id === this.id);
        if (game.settings.get(mod,'updating') || !isMacroInWorld) return;
        if (ui.macros.element.length>0)
            ui.macros.refresh();
        else
            initFolders(false);
    },'WRAPPER');

    libWrapper.register(mod,'CompendiumCollection.prototype.importAll',async function(wrapped, args){
        if (this.documentName === 'Macro'){
            //Modifications to CompendiumCollection.importAll from foundry.js
            // for custom folder functionality.
            const folderName = args.folderName || this.title;
            const options = {}
            await game.settings.set(mod,'updating',true);
            // Optionally, create a folder
            let folder = game.customFolders.macro.folders.contents.find(x => x.name === folderName)
            let f = folder ? folder : await game.MF.MacroFolder.create({
                titleText: folderName,
                parent: null
            });
            await f.save(false);
            //let folderId = f.id;
            //folderName = f.name;
            

            // Load all content
            const documents = await this.getDocuments();
            ui.notifications.info(game.i18n.format("COMPENDIUM.ImportAllStart", {
                number: documents.length,
                type: this.documentName,
                folder: folderName
            }));

            // Prepare import data
            const collection = game.collections.get(this.documentName);
            const createData = documents.map(doc => {
                const data = collection.fromCompendium(doc);
                return data;
            })
            console.log(createData);
            createData.forEach(d => d.flags.cf = null)

            // Create World Documents in batches
            const chunkSize = 100;
            const nBatches = Math.ceil(createData.length / chunkSize);
            let created = [];
            for ( let n=0; n<nBatches; n++ ) {
                const chunk = createData.slice(n*chunkSize, (n+1)*chunkSize);
                const docs = await this.documentClass.createDocuments(chunk, options);
                created = created.concat(docs);
            }
            await f.addMacros(created.map(m => m.id));
            // Notify of success
            ui.notifications.info(game.i18n.format("COMPENDIUM.ImportAllFinish", {
                number: created.length,
                type: this.documentName,
                folder: folderName
            }));
            await initFolders(false);
            await game.settings.set(mod,'updating',false);
            return created;
        }else{
            await wrapped(args);
        }
    },'MIXED');
    libWrapper.register(mod,'Macro.prototype.folder',function(...args){
        if ( !this.data.folder ) return null;
        return game.customFolders.macro.folders.get(this.data.folder);
    },'OVERRIDE');
    libWrapper.register(mod,'Macro.prototype.folder#set',function(...args){
        this.data.folder = [...args][0];
    },'OVERRIDE');

    CONFIG.MacroFolder = {documentClass : MacroFolder};
    CONFIG.ui.macros = MacroFolderDirectory;
    game.MF = {
        MacroEntry:MacroEntry,
        MacroEntryCollection:MacroEntryCollection,
        MacroFolder:MacroFolder,
        MacroFolderCollection:MacroFolderCollection,
        MacroFolderDirectory:MacroFolderDirectory,
    }
}
async function initFolders(refresh=false){
    let allFolders = game.settings.get(mod,'mfolders');
    game.customFolders.macro = {
        folders:new game.MF.MacroFolderCollection([]),
        entries:new game.MF.MacroEntryCollection([])
    }
    // let refresh = false;
    let assigned = []
    let toRemove = [];
    if (allFolders.hidden && !allFolders.hidden.id){
        allFolders.hidden.id = 'hidden'
    }
    if (allFolders.default && !allFolders.default.id){
        allFolders.default.id = 'default';
    }
    let init1 = false;
    if (Object.keys(allFolders).length == 0 && allFolders.constructor === Object){
        // initialize settings
        init1 = true;
  
        allFolders = {
            hidden:{
                macroList:[],
                titleText :'hidden-macros',
                _id:'hidden'
            },
            default:{
                macroList:game.macros.contents.map(m => m.id),
                titleText:'Default',
                _id:'default',
                colorText:'#000000'
            }
        };
    }
    if (!allFolders.default){
        allFolders.default = {
            macroList:[],
            titleText:'Default',
            _id:'default',
            colorText:'#000000'
        }
    }
    if (!allFolders.hidden){
        allFolders.hidden = {
            macroList:[],
            titleText :'hidden-macros',
            _id:'hidden'
        }
    }
    for (let folder of Object.values(allFolders)){
        let macros = []
        folder.macros = []
        for (let macroId of folder.macroList){
            let existingMacro = game.customFolders?.macro?.contents?.get(macroId)
            if (game.macros.has(macroId)){
                if (!existingMacro){
                    let macroWithFolder = new game.MF.MacroEntry(game.macros.get(macroId).data);
                    macroWithFolder.folder = folder._id;
                    game.customFolders.macro.entries.set(macroWithFolder.id,macroWithFolder)
                    macros.push(macroWithFolder)
                } else
                    macros.push(existingMacro);
            }else{
                toRemove.push(macroId);
            }
            //if (folder.id != 'default')
            assigned.push(macroId);
        }
        let f = game.MF.MacroFolder.import(folder,macros)
        // refresh flag works like "init" in this case
        if (init1)
            await f.save(false); 

    }
    // Set default folder content
    let unassigned = game.macros.contents.filter(x => !assigned.includes(x.id))
    for (let macroId of unassigned.map(y => y.id)){
        let playerFolder = game.customFolders.macro.folders.getPlayerFolder(game.macros.get(macroId).data.author)
        let defaultId = playerFolder ? playerFolder.id : 'default'

        if (game.customFolders.macro.entries.has(macroId)){
            // Macro has an entry (assigned to default folder) 
            await game.customFolders.macro.folders.get(defaultId).addMacro(macroId);
        }else{
            // Macro does not have an entry (because it is new)
            let macroWithFolder = new game.MF.MacroEntry(game.macros.get(macroId).data);

            macroWithFolder.folder = defaultId;
            game.customFolders.macro.entries.set(macroId,macroWithFolder)
            await game.customFolders.macro.folders.get(defaultId).addMacro(macroId);
        }
    }
    game.customFolders.macro.folders.default.content = game.customFolders.macro.folders.default.content.concat(unassigned);
    // Check for removed macros
    let missingMacros = false
    let goneMacros = game.customFolders.macro.entries.contents.filter(x => !game.macros.get(x.id));
    for (let c of goneMacros){
        c.parent.removeMacro(c,true,false);
        missingMacros = true;
    }
    
    // Set child folders
    let allEntries = [...game.customFolders.macro.folders.values()]
    for (let mf of allEntries){
        let directChildren = allEntries.filter(f => f.data?.pathToFolder?.length > 0 && f.data.pathToFolder[f.data.pathToFolder.length-1] === mf.id)
        mf.children = directChildren;
    }
    if (refresh){
        ui.macros.customRender()
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
                    await game.settings.set(mod,'user-folder-location','');
                    game.settings.set(mod,'mfolders',importJson).then(async function(){
                        await initFolders(true);
                        if (ui.macros.element.length>0){
                            ui.macros.customRender()
                        }
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
        defaultFolder:this.object.id==='default',
        amacros: alphaSortMacros(Object.values(allMacros[0])),
        umacros: alphaSortMacros(Object.values(allMacros[1])),
        players:game.users.contents,
        submitText: game.i18n.localize(this.isEditDialog ? "FOLDER.Update" : "FOLDER.Create"),
        deleteText: (this.isEditDialog && this.object.id != 'default')?game.i18n.localize("MF.deleteFolder"):null
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
        if (this.object.data.id != 'default'){
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

            if (this.object.data.parent && !game.customFolders.macro.folders.get(this.object.data.parent)?.children?.some(x => x.id === this.object.id)){
                await this.object.moveFolder(this.object.data.parent);
            }
        }
        await this.object.save(true);
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

    for (let user of game.users.contents){
        if (!userFolder.children.find(x => x.name === user.name && x.playerDefault === user.id)){
            let existingDefault = game.customFolders.macro.folders.getPlayerFolder(user.id);
            if (existingDefault){
                existingDefault.playerDefault = null;
               await existingDefault.save(false);
            }
            let folderName = user.name;
            let folderColor = user.data.color;
            let folder = game.MF.MacroFolder.create({
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
        existingFolders[folderData.id]=folderData;
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
                    folders:new game.MF.MacroFolderCollection([]),
                    entries:new game.MF.MacroEntryCollection([])
            }
        } else {
            game.customFolders = {
                macro:{
                    folders:new game.MF.MacroFolderCollection([]),
                    entries:new game.MF.MacroEntryCollection([])
                }
            }
        }
    }
}

// ==========================
// Main hook setup
// ==========================
Hooks.on('init',async function(){
    defineClasses();
    await Settings.registerSettings();
})
Hooks.on('ready',async function(){ 
    if (shouldAddExportButtons()){
        Hooks.call('addExportButtonsForCF')
    }
    await initFolders(false);
});
