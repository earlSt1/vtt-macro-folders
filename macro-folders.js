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
// ==========================
// Folder object structure
// ==========================
export class MacroFolder{
    constructor(title,color,path){
        this.title = title;
        this.color = color;
        this.macros = [];
        this.folders = [];
        this.uid=generateRandomFolderName();
        this.pathToFolder = path;
        this.icon = null;
    }
    initFromExisting(existing){
        this.title = existing['titleText'];
        this.color = existing['colorText']
        this.macros = existing['macroList'];
        this.folders = existing['folders'];
        this.uid = existing['_id'];
        this.path = existing['pathToFolder'];
        this.icon = existing['folderIcon'];
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

function createFolderFromObject(parent,macroFolder, macroElements,prefix,wasOpen){
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
        if (!wasOpen){
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
    if (!wasOpen){
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

   
    
    header.appendChild(title);
    header.appendChild(moveFolderLink);
    header.appendChild(newFolderLink);
    header.appendChild(cogLink);
    folder.appendChild(header);
    // folder.appendChild(folderList);
    // folder.appendChild(macroList);
    folder.appendChild(contents);

    folder.setAttribute('data-mfolder-id',macroFolder._id);
    parent.appendChild(folder)
}


function createHiddenFolder(prefix,remainingElements){
    let tab = document.querySelector(prefix+'.sidebar-tab[data-tab=macros]')
    if (document.querySelector('.hidden-macros')==null){
        let folder = document.createElement('ol')
        folder.classList.add('hidden-macros');
        folder.style.display='none';
        Object.keys(remainingElements).forEach(function(key){
            console.log(modName+" | Adding "+key+" to hidden-macros");
            folder.appendChild(remainingElements[key]);  
        });
        tab.querySelector(prefix+'ol.directory-list').appendChild(folder);   
    }
}
function checkForDeletedMacros(){
    let allFolders = game.settings.get(mod,'mfolders');
    let allMacros = Array.from(game.macros.keys())
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
    });
    if (game.user.isGM){
        game.settings.set(mod,'mfolders',allFolders);
    }
    return allFolders;
}
/*
* Main setup function for macro Folders
* Takes a prefix (a selector to determine whether to modify the Sidebar or Popup window)
* and a list of previously open folders
*/
function setupFolders(prefix,openFolders){

    let allFolders = checkForDeletedMacros();
    let allMacroElements = document.querySelectorAll(prefix+'li.macro.directory-item');

    for (let existingFolder of document.querySelectorAll('.macro-folder')){
        if (!existingFolder.hasAttribute('collapsed')){
            openFolders.push(existingFolder.getAttribute('data-mfolder-id'));
        }
        existingFolder.remove();
    }
    //Remove hidden macro (so we can add new stuff to it later if from refresh)
    if (document.querySelector('.hidden-macros')!=null){
        document.querySelector('.hidden-macros').remove();
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
        if (allFolders[key].titleText != 'hidden-macros'){
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
                let tab = document.querySelector(prefix+'.sidebar-tab[data-tab=macros]')
                let rootFolder = tab.querySelector(prefix+'ol.directory-list')
                if (depth > 0){
                    rootFolder = tab.querySelector("li.macro-folder[data-mfolder-id='"+folder.pathToFolder[depth-1]+"'] > .folder-contents > ol.folder-list")
                }
                createFolderFromObject(rootFolder,folder,macroElements,prefix, (openFolders.includes(folder._id)));
            }
        }
        
    });
    // Create hidden macro folder
    // Add any remaining macros to this folder (newly added macros)
    // (prevents adding a macro from breaking everything)
    if ((allFolders['hidden']!=null 
        && allFolders['hidden'].macroList != null 
        && allFolders['hidden'].macroList.length>0)
        ||Object.keys(allMacroElementsDict).length>0){
        createHiddenFolder(prefix,allMacroElementsDict);
    }


    // create folder button
    if (game.user.isGM && document.querySelector(prefix+'#macros button.mfolder-create')==null){
        let button = document.createElement('button');
        button.classList.add('mfolder-create')
        button.type='submit';
        button.addEventListener('click',function(){createNewFolder([])});
        let folderIcon = document.createElement('i')
        folderIcon.classList.add('fas','fa-fw','fa-folder')
        button.innerHTML = folderIcon.outerHTML+game.i18n.localize("FOLDER.Create");
        document.querySelector(prefix+'#macros .directory-footer').appendChild(button);
    }
    // Hide all empty lists
    for (let element of document.querySelectorAll('.folder-contents > ol')){
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
                    game.settings.set(mod,'mfolders',importJson).then(function(){
                        if (Object.keys(importJson).length===0){
                            Settings.createInitialFolder();
                        }
                        refreshFolders();
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
        return "Move Folder: "+this.object.titleText;
    }
    async getData(options) { 
        let formData = []
        let allFolders = game.settings.get(mod,'mfolders');

        Object.keys(allFolders).forEach(function(key){
            if (key != 'hidden'){
                let prettyTitle = ""
                let prettyPath = []
                if (allFolders[key].pathToFolder != null){
                    for (let folder of allFolders[key].pathToFolder){
                        prettyPath.push(allFolders[folder].titleText);
                        prettyTitle = prettyTitle+allFolders[folder].titleText+"/";
                    }
                }
                prettyTitle=prettyTitle+allFolders[key].titleText
                formData.push({
                    'titleText':allFolders[key].titleText,
                    'titlePath':prettyPath,
                    'fullPathTitle':prettyTitle,
                    'id':key
                })
            }
        });
        formData.sort(function(first,second){
            let fullFirst = "";
            let fullSecond = "";
            for(let firstPath of first['titlePath']){
                fullFirst = fullFirst+firstPath+'/'
            }
            for (let secondPath of second['titlePath']){
                fullSecond = fullSecond+secondPath+'/'
            }
            fullFirst = fullFirst+first['titleText'];
            fullSecond = fullSecond+second['titleText'];
            if (fullFirst < fullSecond){
                return -1
            } else if (fullFirst > fullSecond){
                return 1;
            }
            return 0;
        });
        if (this.object.pathToFolder != null && this.object.pathToFolder.length>0){
            formData.splice(0,0,{
                'titleText':'Root',
                'titlePath':'Root',
                'fullPathTitle':'Root',
                'id':'root'
            })
        }
        let temp = Array.from(formData);
        for (let obj of temp){
            if (obj.id!='root' &&(
                // If formData contains folders which are direct parents of this.object
                (this.object.pathToFolder != null
                && this.object.pathToFolder.length>0
                && obj.id === this.object.pathToFolder[this.object.pathToFolder.length-1])
                // or If formData contains folders where this.object is directly on the path
                || (allFolders[obj.id].pathToFolder != null
                    && allFolders[obj.id].pathToFolder.includes(this.object._id))
                // or If formData contains this.object
                || obj.id === this.object._id))
                formData.splice(formData.indexOf(obj),1);
            }

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

        let allFolders = game.settings.get(mod,'mfolders');
        let success = false;
        if (destFolderId != null && destFolderId.length>0){
            let notificationDest = ""
            if (destFolderId=='root'){
                allFolders[this.object._id]['pathToFolder'] = []
                success = this.updateFullPathForChildren(allFolders,this.object._id,[])
                notificationDest="Root";
            }else{
                let destParentPath = (allFolders[destFolderId]['pathToFolder']==null)?[]:allFolders[destFolderId]['pathToFolder']
                let fullPath = destParentPath.concat([destFolderId]);
                allFolders[this.object._id]['pathToFolder'] = fullPath;
                success = this.updateFullPathForChildren(allFolders,this.object._id,fullPath)
                notificationDest = allFolders[destFolderId].titleText;
            }
            if (success==true){
                ui.notifications.info("Moved folder "+this.object.titleText+" to "+notificationDest)
                await game.settings.set(mod,'mfolders',allFolders);
                refreshFolders();
            }else{
                ui.notifications.error("Max folder depth reached ("+FOLDER_LIMIT+")")
            }
        }
        
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
        if ( this.object.colorText.length>1  ) {
            return `${game.i18n.localize("FOLDER.Update")}: ${this.object.titleText}`;
        }
        return game.i18n.localize("FOLDER.Create");
    }
    getGroupedPacks(){
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
      let allPacks = this.getGroupedPacks();
      return {
        folder: this.object,
        amacros: alphaSortMacros(Object.values(allPacks[0])),
        umacros: alphaSortMacros(Object.values(allPacks[1])),
        submitText: game.i18n.localize( this.object.colorText.length>1   ? "FOLDER.Update" : "FOLDER.Create"),
        deleteText: this.object.colorText.length>1?"Delete Folder":null
      }
    }
  
    /** @override */
    async _updateObject(event, formData) {
        this.object.titleText = formData.name;
        if (formData.color.length===0){
            this.object.colorText = '#000000'; 
        }else{
            this.object.colorText = formData.color;
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
        

        // Update macro assignment
        let macrosToAdd = []
        let macrosToRemove = []
        for (let macroKey of game.macros.keys()){
            if (formData[macroKey] && this.object.macroList.indexOf(macroKey)==-1){
                // Box ticked AND macro not in folder
                macrosToAdd.push(macroKey);
            
            }else if (!formData[macroKey] && this.object.macroList.indexOf(macroKey)>-1){
                // Box unticked AND macro in folder
                macrosToRemove.push(macroKey);
            }
        }
        if (formData.delete != null && formData.delete[0]==1){
            //do delete stuff
            new Dialog({
                title: "Delete Folder",
                content: "<p>Are you sure you want to delete the folder <strong>"+this.object.titleText+"?</strong></p>"
                        +"<p>This will delete <strong>all</strong> subfolders.</p>"
                        +"<p><i>Macros in these folders will not be deleted</i></p>",
                buttons: {
                    yes: {
                        icon: '<i class="fas fa-check"></i>',
                        label: "Yes",
                        callback: () => deleteAllChildFolders(this.object)
                    },
                    no: {
                        icon: '<i class="fas fa-times"></i>',
                        label: "No"
                    }
                }
            }).render(true);
        
        }else{
            await updateFolders(macrosToAdd,macrosToRemove,this.object);
        }
    }
}
function refreshFolders(){  
    if (document.querySelector('section#macros') != null){
        let allFolders = document.querySelectorAll('.macro-folder')
            let openFoldersSidebar = [];
            for (let folder of allFolders){
                if (!folder.hasAttribute('collapsed')){
                    //folder open
                    openFoldersSidebar.push(folder.getAttribute('data-mfolder-id'));
                }
            }
        setupFolders('',openFoldersSidebar);
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

    await game.settings.set(mod,'mfolders',allFolders);
    refreshFolders()
}
// ==========================
// Event funtions
// ==========================
function closeFolder(parent){
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
        newFolderLink.style.display='none'
        moveFolderLink.style.display='none'
    }
    parent.setAttribute('collapsed','');
}
function openFolder(parent){
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
        newFolderLink.style.display=''
        moveFolderLink.style.display=''
    }
    parent.removeAttribute('collapsed');
}
function toggleFolder(event,parent){
    event.stopPropagation();
    if (parent.hasAttribute('collapsed')){
        openFolder(parent);
    }else{
        closeFolder(parent);
        for (let child of parent.querySelectorAll('.macro-folder')){
            closeFolder(child);
        }
    }
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
            closeFolder(folder);
            folder.style.display = 'none';
        }else {
            openFolder(folder);
            folder.style.display = '';
        }
        if (searchTerm.length==0){
            closeFolder(folder);
        }
    }
    
}

export class Settings{
    static registerSettings(){
        game.settings.registerMenu(mod,'settingsMenu',{
            name: 'Configuration',
            label: 'Import/Export Configuration',
            icon: 'fas fa-wrench',
            type: ImportExportConfig,
            restricted: true
        });
        game.settings.register(mod, 'mfolders', {
            scope: 'world',
            config: false,
            type: Object,
            default:{}
        });
        
        if (Object.keys(game.settings.get(mod,'mfolders')).length === 0){
            this.createInitialFolder()
        }
    }
    static createInitialFolder(){
        if (game.user.isGM){
            let allFolders = game.settings.get(mod,'mfolders');
            allFolders['hidden']={'macroList':[],'titleText':'hidden-macros'};
            let defaultFolder = new MacroFolder('Macros','#000000',[]);
            defaultFolder.macros = Array.from(game.macros.keys());
            allFolders[defaultFolder.uid]=defaultFolder;
            game.settings.set(mod,'mfolders',allFolders).then(function(){
                return true;
            });
            
        }
        return false;
    }
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
}

// ==========================
// Main hook setup
// ==========================
var eventsSetup = []
Hooks.on('ready',async function(){
    Settings.registerSettings();

    Hooks.on('renderMacroDirectory',async function(){

        await loadTemplates(["modules/macro-folders/macro-folder-edit.html"]);
        setupFolders("",[])
        addEventListeners()
    });
});