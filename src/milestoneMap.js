'use strict'

var MilestoneMap = function (obj, pagesize) {
    
    //state
    this.start;
    this.end;
    this.programmes;
    this.projects;
    this.milestones;
    this.msAtReports;
    this.reports;
    this.dependencies;
    
    this.currReport;
    this.cmpReport;

    this.businessMs;
    
    //view
    this.elemReportSelectors = Draw.elem ("span", {});
    
    this.elemContainer = Draw.elem ("div", {
        "class": "mMapContainer"
    }, this.elemContaine);
    this.elemContainer.addEventListener("click", this.deactivateOnUnclick.bind(this));

    this.printElem = Draw.elem("span", {
        "class": "printablePages"
    });
    this.depLayer;
    this.scrollbox;
    this.elemFixed;
    
    //view model
    this.width;
    this.maxHeight;
    this.unclicker = new Unclicker (this.elemContainer);
    this.dateHeader;

    // {width, height}
    this.pageSize = pagesize || Loader.A3SIZE;

    // events
    this.globalMode = MilestoneMap.SELECT;
    this.globalData = null;
    this.globalModeSet = false;

    this.restore (obj);
};
MilestoneMap.SELECT = 0;
MilestoneMap.CREATEDEPENDENCY = 1;

// restore here will also draw as well
MilestoneMap.prototype.restore = function (obj) {
    this.start = obj.start;
    this.end = obj.end;
    this.name = obj.name;

    this.businessMs = new BusinessMs (this);

    this.programmes = obj.programmes.map((programme, i) => {
        return new Programme (programme, i, this);
    });  
    this.projects = obj.projects.map((project, i) => {
        return new Project (project, i, this);
    });  
    this.milestones = obj.milestones.map((milestone, i) => {
        return new Milestone (milestone, i, this);
    });
    this.reports = obj.reports.map ((report, i) => {
        return new Report (report, i, this);
    });
    this.currReport = this.reports[obj.currReport];
    this.cmpReport = this.reports[obj.cmpReport];
    
    this.msAtReports = obj.msAtReports.map((ms, i) => {
        return new MsAtReport (ms, i, this);
    });
    this.dependencies = obj.dependencies.map((dep, i) => {
        return new Dependency (dep, i, this);
    });
};
MilestoneMap.prototype.save = function () {
    return {
        "name": this.name,
        "end": this.end,
        "start": this.start,
        "currReport": this.currReport.index,
        "cmpReport": this.cmpReport.index,
        "reports": this.reports.map(o => o.save()),
        "programmes": this.programmes.map(o => o.save()),
        "projects": this.projects.map(o => o.save()),
        "milestones": this.milestones.map(o => o.save()),
        "msAtReports": this.msAtReports.map(o => o.save()),
        "dependencies": this.dependencies.map(o => o.save())
    }
};

// drawing methods
MilestoneMap.prototype.reportSelectors = function () {
    var parent = this.elemReportSelectors;
    parent.innerHTML = "";
    var attrs = {"class": "reportSelector"};

    var entries = this.reports.map (report => report.getMenuText());
    Draw.dropDownSegment (
        "Current:", this.modifyCurrReportEvt.bind(this), entries, attrs, parent);
    Draw.dropDownSegment (
        "Baseline:", this.modifyCmpReportEvt.bind(this), entries, attrs, parent);
};

MilestoneMap.prototype.draw = function () {
    this.elemContainer.innerHTML = "";
    
    this.elemFixed = Draw.svgElem ("svg", {
        "class": "mMapFixed"
    }, this.elemContainer);
    this.scrollbox = Draw.elem ("div", {
        "class": "mMapScrollBox"
    }, this.elemContainer);
    
    this.elemMain = Draw.svgElem("svg", {
        "class": "milestoneMap",
        "height": 5000
    }, this.scrollbox);
    
    var bg = Draw.svgElem("g", {
        "class": "bg"
    }, this.elemMain);
    
    this.depLayer = Draw.svgElem("g", {
        "class": "dependencies"
    }, this.elemMain);
    
    var fg = Draw.svgElem("g", {
        "class": "fg"
    }, this.elemMain);

    this.width = Draw.getElemWidth(this.elemMain);

    // maybe this would be better as a series of functions rather than a class.
    this.dateHeader = new DateHeader (this, this.elemFixed, bg);
    
    this.msAtReports.forEach (elem => elem.draw());
    this.milestones.forEach (elem => elem.draw());
    this.projects.forEach (elem => elem.draw());
    this.elemFixed.appendChild(this.businessMs.draw());
    bg.appendChild (this.businessMs.elemLines);
    this.programmes.forEach (elem => fg.appendChild(elem.draw()));

    this.elemFixed.appendChild(this.currReport.drawLine());
    fg.appendChild (this.currReport.lineElemMain);
    
    this.reflow ();
};

MilestoneMap.prototype.PX_PER_MM = 5.0;
MilestoneMap.prototype.drawPrint = function () {
    this.printElem.innerHTML = "";
    
    this.width = this.pageSize.width * MilestoneMap.prototype.PX_PER_MM;
    this.height = this.pageSize.height * MilestoneMap.prototype.PX_PER_MM

    this.msAtReports.forEach (elem => elem.draw());
    this.milestones.forEach (elem => elem.draw());
    this.projects.forEach (elem => elem.draw());

    this.programmes.forEach(programme => programme.draw());

    var reportNode = this.currReport.drawLine();
    var businessMsNode = this.businessMs.draw();

    var programmei = 0;
    var projecti = 0;
    // draw at least one page
    do {
        var page = Draw.svgElem ("svg", {
            "class": "milestoneMapPage",
            "viewbox": "0 0 " +
                (this.pageSize.width * MilestoneMap.prototype.PX_PER_MM) + " " +
                (this.pageSize.height * MilestoneMap.prototype.PX_PER_MM),
        }, this.printElem);

        var yoffset = new DateHeader (this, page).endy;
        
        var clone = businessMsNode.cloneNode(true);
        clone.setAttribute("transform", "translate(0, " + yoffset + ")");
        page.appendChild(clone);
        yoffset += this.businessMs.height;
        
        var spaceLeft = this.pageSize.height * MilestoneMap.prototype.PX_PER_MM - yoffset;

        if (spaceLeft <= 0) {
            throw new Error ("Page size not large enough for Business Milestones.");
        }

        // nothing more to draw;
        if (programmei >= this.programmes.length) {
            page.appendChild(this.currReport.drawLine().cloneNode(true));
            break;
        }
        // TODO: dependencies
        
        var first = true;
        
        do {
            var programme = this.programmes[programmei];
            var vals = programme.drawPrint (spaceLeft, projecti, first);
            first = false;

            page.appendChild(vals.elem);
            vals.elem.setAttribute("transform", "translate(0, " + yoffset + ")");

            //completely drawn
            if (vals.index === programme.projects.length) {
                programmei ++;
                projecti = 0;
                yoffset += spaceLeft - vals.spaceLeft;
                spaceLeft = vals.spaceLeft;
            }
            // incompletely drawn, continue to next page
            else {
                projecti = vals.index;
                break;
            }
        } while (programmei < this.programmes.length);
        
        page.appendChild(reportNode.cloneNode(true));
    } while (programmei < this.programmes.length);
    

    return this.printElem;
};
MilestoneMap.prototype.drawDependencies = function () {
    this.dependencies.forEach (elem => {
        elem.draw();
        this.depLayer.appendChild (elem.elem);
    });
};

MilestoneMap.prototype.deactivateOnUnclick = function () {
    if (this.globalModeSet) {
        this.globalModeSet = false;
    }
    else {
        this.globalMode = MilestoneMap.SELECT;
        this.globalData = null;
    }
};

MilestoneMap.SPACEFORFIRSTPROJECT = 35;
MilestoneMap.prototype.reflow = function () {
    var headerHeight = Draw.verticalReflow (this.dateHeader.endy, [this.businessMs]);
    this.elemFixed.setAttribute("height", headerHeight);

    var bodyHeight = this.maxHeight - headerHeight;
    this.scrollbox.setAttribute("style", "max-height:" + bodyHeight + "px;");
    bodyHeight -= 4;
    
    var mainHeight = Draw.verticalReflow (MilestoneMap.SPACEFORFIRSTPROJECT, this.programmes);
    mainHeight = mainHeight < bodyHeight ? bodyHeight : mainHeight;
    this.elemMain.setAttribute("height", mainHeight);
    
    this.drawDependencies();
};

// x coordinate methods
MilestoneMap.SIDEBARFRACTION = 0.2;
MilestoneMap.MAXSIDEBARWIDTH = 350;
MilestoneMap.prototype.getSideBarWidth = function () {
    var maxWidth = this.width * MilestoneMap.SIDEBARFRACTION;
    return maxWidth < MilestoneMap.MAXSIDEBARWIDTH ?
        maxWidth : MilestoneMap.MAXSIDEBARWIDTH;
};
MilestoneMap.prototype.getUsableWidth = function () {
    return this.width - this.getSideBarWidth();
};
MilestoneMap.prototype.getXCoord = function (date) {
    var z = (date.valueOf() - this.start)/(this.end - this.start)
    return z * this.getUsableWidth() + this.getSideBarWidth();
};
// this is a static method, consider changing?
MilestoneMap.prototype.defaultDate = function () {
    var now = new Date(Date.now());
    var offset = now.getTimezoneOffset() * 60 * 1000;
    return now.valueOf() + offset;
};

MilestoneMap.prototype.isInInterval = function (value) {
    return (value >= this.start && value <= this.end);
};

MilestoneMap.prototype.clampDate = function (date) {
    return Util.clamp (this.start, this.end, date);
};

// Modifications
MilestoneMap.prototype.modifyCurrReport = function (index) {
    if (index >= 0 && index < this.reports.length) {
        return this.currReport = this.reports[index];
    }
};
MilestoneMap.prototype.modifyCmpReport = function (index) {
    if (index >= 0 && index < this.reports.length) {
        return this.cmpReport = this.reports[index];
    }
};

// add and removal methods
MilestoneMap.prototype.addMsAtReport = function (obj) {
    var msAtReport = new MsAtReport (obj, this.msAtReports.length, this);
    this.msAtReports.push(msAtReport);
    return msAtReport;
};
MilestoneMap.prototype.removeMsAtReport = function (msAtReport) {
    Util.removeFromIndexedArray (this.msAtReports, msAtReport);
};

MilestoneMap.prototype.addDependency = function (obj) {
    var dep = new Dependency (obj, this.dependencies.length, this);
    this.dependencies.push(dep);
    this.depLayer.appendChild (dep.elem);
    return dep;
};
MilestoneMap.prototype.removeDependency = function (dependency) {
    Util.removeFromIndexedArray (this.dependencies, dependency);
};

MilestoneMap.prototype.addMilestone = function (obj) {
    var milestone = new Milestone (obj, this.milestones.length, this);
    this.milestones.push(milestone);
    return milestone;
};
MilestoneMap.prototype.removeMilestone = function (milestone) {
    Util.removeFromIndexedArray (this.milestones, milestone)
};

MilestoneMap.prototype.addProject = function (obj) {
    var project = new Project (obj, this.projects.length, this);
    this.projects.push (project);
    return project;
};
MilestoneMap.prototype.removeProject = function (project) {
    Util.removeFromIndexedArray (this.projects, project);
};

MilestoneMap.prototype.addProgramme = function (obj) {
    var programme = new Programme (obj, this.programmes.length, this);
    this.programmes.push (programme);
    return programme;
};
MilestoneMap.prototype.removeProgramme = function (programme) {
    Util.removeFromIndexedArray (this.programmes, programme);
};

MilestoneMap.prototype.addReport = function (obj) {
    var report = new Report (obj, this.reports.length, this);
    this.reports.push (report);

    var msAtReports = this.msAtReports.filter(ms => {
        return ms.report === this.currReport;
    });

    msAtReports.forEach (ms => {
        var obj = ms.save();
        obj.report = report.index;
        this.addMsAtReport (obj);
    });

    var dependencies = this.dependencies.filter(dep => {
        return dep.report === this.currReport;
    });

    dependencies.forEach (dep => {
        var obj = dep.save();
        obj.report = report.index;
        this.addDependency(obj);
    });

    this.cmpReport = this.currReport;
    this.currReport = report;
};
MilestoneMap.prototype.validateReportFromCSV = function (arr) {
    for (var i = 1; i < arr.length; i++) {
        var row = arr[i];
        if (row.length !== 6 && row.length !== 5) {
            throw new Error ("CSV row " + (i + 1) + " does not contain the correct number of columns");
        }

        var status = row [4];
        if (status !== "complete" && status !== "on-track" &&
            status !== "at-risk" && status !== "late" && status !== "previous")
        {
            throw new Error ("Milestone health on row " + (i + 1) + " is invalid." +
                             "Must be one of 'complete', 'on-track', 'at-risk', 'late', or 'previous'")
        }

        var date = Util.fromISODateOnly(row [3]);
        if (isNaN(date)) {
            throw new Error ("Invalid date format on row " + (i + 1) +
                             ". The Date must be formatted as YYYY-MM-DD");
        }
    }
};

MilestoneMap.prototype.addCSVRow = function (row) {
    var programmeName = row [0];
    var projectName = row [1];
    var milestoneName = row [2];
    var milestoneDate = row [3];
    var milestoneHealth = row [4];
    var milestoneComment = row [5] || "";
    
    if (programmeName !== "Business Milestones") {
        var programme = this.programmes.find(programme => {
            return programme.name === programmeName;
        });
        if (!programme) {
            programme = this.addProgramme({"name": programmeName});
        }

        var project = programme.projects.find (project => {
            return project.name === projectName;
        });
        if (!project) {
            project = this.addProject ({
                "name": projectName,
                "programme": programme.index
            });
        }
    }
    else {
        project = this.businessMs;
    }

    var milestone = project.milestones.find(milestone => {
        return milestone.name === milestoneName;
    });
    if (!milestone) {
        milestone = this.addMilestone({
            "name": milestoneName,
            "project": project.index
        });
    }

    var msAtReport = milestone.currentReport();
    var obj = {
        "milestone": milestone.index,
        "report": this.currReport.index,
        "comment": milestoneComment,
        "status": MsAtReport.classToStatus(milestoneHealth),
        "date": Util.fromISODateOnly(milestoneDate)
    };
    if (!msAtReport) {
        this.addMsAtReport(obj);
    }
    else {
        msAtReport.restore(obj);
    }
    
};

MilestoneMap.prototype.addReportFromCSV = function (arr) {
    this.validateReportFromCSV(arr);

    for (var i = 1; i < arr.length; i++) {
        this.addCSVRow(arr[i]);
    }
};
MilestoneMap.prototype.removeReport = function (report) {
    Util.removeFromIndexedArray (this.reports, report);
};


// user events
MilestoneMap.prototype.newProgramme = function () {
    this.addProgramme({
        "name": "New Programme"
    });

    this.draw();
};
MilestoneMap.CSVHEADING =
    [
        "Programme Name",
        "Project Name",
        "Milestone Name",
        "Date (YYYY-MM-DD)",
        "Health ('complete', 'on-track', 'at-risk', 'late', or 'previous)",
        "Comment"
    ].map(JSON.stringify).join(",");
MilestoneMap.prototype.exportCSVMilestones = function () {
    var data = this.milestones
        .filter(milestone => milestone.currentReport())
        .map(milestone => milestone.exportCSVRow())
        .join("\n");
    return MilestoneMap.CSVHEADING + "\n" + data;
};

// called by svgTextInput
MilestoneMap.prototype.modifyName = function (e, input) {
    this.name = input.text;
};

// called by svgDateInput change of date will require complete redraw.
MilestoneMap.prototype.modifyStartDate = function (e, input) {
    this.start = input.date;
    this.draw();
};

// called by svgDateInput change of date will require complete redraw.
MilestoneMap.prototype.modifyEndDate = function (e, input) {
    this.end = input.date;
    this.draw();
};


MilestoneMap.prototype.modifyCurrReportEvt = function (evt) {
    this.modifyCurrReport (evt.currentTarget.value);
    this.draw ();
};
MilestoneMap.prototype.modifyCmpReportEvt = function (evt) {
    this.modifyCmpReport (evt.currentTarget.value);
    this.draw ();
};
